const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { readJsonSync, writeJsonAtomicSync } = require('@beam/storage/node/json-file');
const { defaultZoomAutoFollow, defaultZoomMotionBlur } = require('./project-editor-state.cjs');

function combineProjects(projectStore, screenshotStore, projectIds, options = {}) {
  if (!Array.isArray(projectIds) || projectIds.length < 2) {
    throw new Error('At least two projects must be selected to combine.');
  }

  for (const id of projectIds) {
    if (typeof id !== 'string' || !id) {
      throw new Error('Invalid project identifier.');
    }
  }

  const projects = projectIds.map((id) => {
    let mode = 'studio';
    let dir = null;
    try {
      dir = projectStore.directoryFor(id);
    } catch {
      if (screenshotStore) {
        try {
          screenshotStore.read(id);
          dir = screenshotStore.directoryFor(id);
          mode = 'screenshot';
        } catch {}
      }
    }
    if (!dir) throw new Error(`Project ${id} not found.`);
    return { id, mode, dir };
  });

  const getProjectName = (p) => {
    try {
      if (p.mode === 'screenshot' && screenshotStore) {
        return screenshotStore.readSummary(p.id).name || 'Screenshot';
      }
      const manifest = readJsonSync(path.join(p.dir, 'project.json'));
      return manifest.name || `Project ${p.id.slice(0, 8)}`;
    } catch {
      return `Project ${p.id.slice(0, 8)}`;
    }
  };

  let name = typeof options.name === 'string' && options.name.trim() ? options.name.trim().slice(0, 80) : '';
  if (!name) {
    const names = projects.map((p) => getProjectName(p));
    name = names.slice(0, 2).join(' + ');
    if (names.length > 2) name += ` + ${names.length - 2} more`;
    if (name.length > 80) name = `${name.slice(0, 77)}...`;
  }

  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const total = projects.length;

  onProgress?.({
    current: 0,
    total,
    percent: 5,
    stage: 'preparing',
  });

  const newProjectSummary = projectStore.create({ name });
  const newProjectId = newProjectSummary.id;
  const newDir = projectStore.directoryFor(newProjectId);
  const newManifest = readJsonSync(path.join(newDir, 'project.json'));

  const destSessions = [];
  const destAssets = [];
  const destClips = [];
  const destZooms = [];
  const destKeyboardSessions = [];
  let timelineOffsetMs = 0;
  let firstPresentation = null;
  let firstZoomSettings = null;
  let lastCompletedName = undefined;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const pName = getProjectName(p);
    const startPct = Math.round(5 + (i / total) * 85);

    onProgress?.({
      current: i + 1,
      total,
      percent: startPct,
      currentProjectName: pName,
      completedProjectName: lastCompletedName,
      stage: 'processing',
    });

    if (p.mode === 'screenshot') {
      const sourcePng = path.join(p.dir, 'source.png');
      if (fs.existsSync(sourcePng)) {
        const destMediaDir = path.join(newDir, 'media');
        fs.mkdirSync(destMediaDir, { recursive: true });
        const mediaFileName = `${randomUUID()}.png`;
        fs.copyFileSync(sourcePng, path.join(destMediaDir, mediaFileName));

        const durationMs = 5000;
        const assetId = randomUUID();
        destAssets.push({
          id: assetId,
          kind: 'image',
          name: screenshotStore.readSummary(p.id).name || 'Screenshot',
          fileName: mediaFileName,
          durationMs,
          width: null,
          height: null,
          origin: 'project',
        });
        destClips.push({
          id: randomUUID(),
          kind: 'image',
          name: screenshotStore.readSummary(p.id).name || 'Screenshot',
          assetId,
          timelineStartMs: timelineOffsetMs,
          timelineDurationMs: durationMs,
          sourceInMs: 0,
          sourceDurationMs: durationMs,
          playbackRate: 1,
          transitions: { entry: null, exit: null },
          enabled: true,
          order: 30000,
          trackId: `track-visual-img-${i}`,
          transform: { x: 0, y: 0, width: 1, height: 1 },
        });
        timelineOffsetMs += durationMs;
      }
      continue;
    }

    const srcManifest = readJsonSync(path.join(p.dir, 'project.json'));
    const sessionIdMap = new Map();

    if (Array.isArray(srcManifest.sessions)) {
      for (const sess of srcManifest.sessions) {
        if (!sess?.sessionId) continue;
        const srcSessionDir = path.join(p.dir, sess.relativePath || `session-${sess.sessionId}`);
        if (!fs.existsSync(srcSessionDir)) continue;

        let newSessionFolder = `session-${sess.sessionId}`;
        let newSessionId = sess.sessionId;
        if (destSessions.some((s) => s.sessionId === newSessionId)) {
          newSessionId = randomUUID();
          newSessionFolder = `session-${newSessionId}`;
        }
        sessionIdMap.set(sess.sessionId, newSessionId);

        const destSessionDir = path.join(newDir, newSessionFolder);
        fs.cpSync(srcSessionDir, destSessionDir, { recursive: true });
        destSessions.push({
          sessionId: newSessionId,
          relativePath: newSessionFolder,
        });
      }
    }

    const mediaFileNameMap = new Map();
    const srcMediaDir = path.join(p.dir, 'media');
    if (fs.existsSync(srcMediaDir)) {
      const destMediaDir = path.join(newDir, 'media');
      fs.mkdirSync(destMediaDir, { recursive: true });
      const mediaFiles = fs.readdirSync(srcMediaDir);
      for (const mf of mediaFiles) {
        let destFileName = mf;
        if (fs.existsSync(path.join(destMediaDir, destFileName))) {
          const ext = path.extname(mf);
          destFileName = `${randomUUID()}${ext}`;
        }
        mediaFileNameMap.set(mf, destFileName);
        fs.copyFileSync(path.join(srcMediaDir, mf), path.join(destMediaDir, destFileName));
      }
    }

    const srcBgDir = path.join(p.dir, 'backgrounds');
    if (fs.existsSync(srcBgDir)) {
      const destBgDir = path.join(newDir, 'backgrounds');
      fs.mkdirSync(destBgDir, { recursive: true });
      const bgFiles = fs.readdirSync(srcBgDir);
      for (const bg of bgFiles) {
        if (!fs.existsSync(path.join(destBgDir, bg))) {
          fs.copyFileSync(path.join(srcBgDir, bg), path.join(destBgDir, bg));
        }
      }
    }

    if (i === 0) {
      for (const tFile of ['thumbnail.webp', 'thumbnail.png', 'thumbnail.jpg', 'thumbnail.jpeg']) {
        const tPath = path.join(p.dir, tFile);
        if (fs.existsSync(tPath)) {
          fs.copyFileSync(tPath, path.join(newDir, 'thumbnail.webp'));
          break;
        }
      }
      if (srcManifest.editor?.presentation) {
        firstPresentation = JSON.parse(JSON.stringify(srcManifest.editor.presentation));
      }
      if (srcManifest.editor?.zoom) {
        firstZoomSettings = {
          motionBlur: srcManifest.editor.zoom.motionBlur,
          autoFollow: srcManifest.editor.zoom.autoFollow,
        };
      }
    }

    const srcComp = srcManifest.editor?.composition;
    const clipIdMap = new Map();
    let projectDurationMs = 0;

    if (srcComp && Array.isArray(srcComp.clips) && srcComp.clips.length > 0) {
      for (const clip of srcComp.clips) {
        if (clip && Number.isFinite(clip.timelineStartMs) && Number.isFinite(clip.timelineDurationMs)) {
          projectDurationMs = Math.max(projectDurationMs, Math.round(clip.timelineStartMs + clip.timelineDurationMs));
        }
      }
      if (typeof srcComp.durationMs === 'number' && Number.isFinite(srcComp.durationMs)) {
        projectDurationMs = Math.max(projectDurationMs, srcComp.durationMs);
      }
      projectDurationMs = Math.max(projectDurationMs, 40);

      const assetIdMap = new Map();
      if (Array.isArray(srcComp.assets)) {
        for (const asset of srcComp.assets) {
          if (!asset || !asset.id) continue;
          const newAssetId = randomUUID();
          assetIdMap.set(asset.id, newAssetId);
          const clonedAsset = { ...asset, id: newAssetId };
          if (clonedAsset.origin === 'session' && clonedAsset.sessionId) {
            clonedAsset.sessionId = sessionIdMap.get(clonedAsset.sessionId) || clonedAsset.sessionId;
          } else if (clonedAsset.origin === 'project' && clonedAsset.fileName) {
            clonedAsset.fileName = mediaFileNameMap.get(clonedAsset.fileName) || clonedAsset.fileName;
          }
          destAssets.push(clonedAsset);
        }
      }

      for (const clip of srcComp.clips) {
        if (!clip || !clip.id) continue;
        const newClipId = randomUUID();
        clipIdMap.set(clip.id, newClipId);
        const newAssetId = assetIdMap.get(clip.assetId) ?? clip.assetId;
        const clonedClip = {
          ...clip,
          id: newClipId,
          assetId: newAssetId,
          timelineStartMs: Math.round(clip.timelineStartMs + timelineOffsetMs),
          ...(clip.groupId ? { groupId: `${clip.groupId}-p${i}` } : {}),
        };
        destClips.push(clonedClip);
      }

      for (const clip of destClips) {
        if (clip.recordingClipId && clipIdMap.has(clip.recordingClipId)) {
          clip.recordingClipId = clipIdMap.get(clip.recordingClipId);
        }
      }

      if (srcManifest.editor?.zoom?.elements && Array.isArray(srcManifest.editor.zoom.elements)) {
        for (const ze of srcManifest.editor.zoom.elements) {
          if (!ze) continue;
          destZooms.push({
            ...ze,
            id: randomUUID(),
            sessionId: sessionIdMap.get(ze.sessionId) || ze.sessionId,
            startMs: Math.round(ze.startMs + timelineOffsetMs),
            endMs: Math.round(ze.endMs + timelineOffsetMs),
            linkedClipId: ze.linkedClipId ? clipIdMap.get(ze.linkedClipId) || null : ze.linkedClipId,
          });
        }
      }

      if (Array.isArray(srcComp.keyboardCaptionSessions)) {
        for (const ks of srcComp.keyboardCaptionSessions) {
          const mapped = sessionIdMap.get(ks) || ks;
          if (!destKeyboardSessions.includes(mapped)) destKeyboardSessions.push(mapped);
        }
      }

      timelineOffsetMs += projectDurationMs;
    } else {
      let sessionCombinedDuration = 0;
      if (Array.isArray(srcManifest.sessions)) {
        for (const sess of srcManifest.sessions) {
          const mappedSessionId = sessionIdMap.get(sess.sessionId) || sess.sessionId;
          const sessionDir = path.join(newDir, `session-${mappedSessionId}`);
          const manifestFile = [
            path.join(sessionDir, 'manifest.json'),
            path.join(sessionDir, 'manifest.partial.json'),
          ].find((f) => fs.existsSync(f));
          if (!manifestFile) continue;
          let sm = {};
          try {
            sm = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
          } catch {}
          const durMs =
            sm.durationNs && Number.isFinite(sm.durationNs)
              ? Math.max(40, Math.round(sm.durationNs / 1_000_000))
              : 10_000;
          sessionCombinedDuration += durMs;

          const screenDir = path.join(sessionDir, 'screen');
          let videoFile = null;
          if (fs.existsSync(screenDir)) {
            const mp4s = fs
              .readdirSync(screenDir)
              .filter((n) => /\.mp4$/i.test(n))
              .sort();
            if (mp4s[0]) videoFile = mp4s[0];
          }

          if (videoFile) {
            const assetId = randomUUID();
            destAssets.push({
              id: assetId,
              kind: 'video',
              name: 'Screen recording',
              fileName: null,
              durationMs: durMs,
              width: null,
              height: null,
              origin: 'session',
              sessionId: mappedSessionId,
              sessionPath: `screen/${videoFile}`,
            });
            destClips.push({
              id: randomUUID(),
              trackId: `session:${mappedSessionId}:track:screen`,
              kind: 'screen',
              name: 'Screen recording',
              assetId,
              timelineStartMs: timelineOffsetMs,
              timelineDurationMs: durMs,
              sourceInMs: 0,
              sourceDurationMs: durMs,
              playbackRate: 1,
              transitions: { entry: null, exit: null },
              enabled: true,
              order: 30000,
              transform: { x: 0, y: 0, width: 1, height: 1 },
            });
          }

          if (Array.isArray(sm.tracks)) {
            for (const track of sm.tracks) {
              if (track?.kind === 'system-audio' || track?.kind === 'microphone') {
                const seg = track.segments?.[0];
                if (seg?.path) {
                  const assetId = randomUUID();
                  destAssets.push({
                    id: assetId,
                    kind: 'audio',
                    name: track.kind === 'system-audio' ? 'System audio' : 'Microphone',
                    fileName: null,
                    durationMs: durMs,
                    origin: 'session',
                    sessionId: mappedSessionId,
                    sessionPath: seg.path,
                  });
                  destClips.push({
                    id: randomUUID(),
                    kind: 'audio',
                    name: track.kind === 'system-audio' ? 'System audio' : 'Microphone',
                    assetId,
                    role: track.kind === 'system-audio' ? 'system' : 'microphone',
                    volume: 100,
                    timelineStartMs: timelineOffsetMs,
                    timelineDurationMs: durMs,
                    sourceInMs: 0,
                    sourceDurationMs: durMs,
                    playbackRate: 1,
                    transitions: { entry: null, exit: null },
                    enabled: true,
                    order: 40000,
                  });
                }
              }
            }
          }
        }
      }
      timelineOffsetMs += Math.max(sessionCombinedDuration, 1000);
    }

    const endPct = Math.round(5 + ((i + 1) / total) * 85);
    lastCompletedName = pName;
    onProgress?.({
      current: i + 1,
      total,
      percent: endPct,
      currentProjectName: i + 1 < total ? getProjectName(projects[i + 1]) : undefined,
      completedProjectName: pName,
      stage: 'processed',
    });
  }

  onProgress?.({
    current: total,
    total,
    percent: 92,
    completedProjectName: lastCompletedName,
    stage: 'finalizing',
  });

  newManifest.sessions = destSessions;
  newManifest.editor = {
    schemaVersion: 3,
    applyGlobalDefaults: false,
    composition: {
      schemaVersion: 14,
      durationMs: timelineOffsetMs,
      assets: destAssets,
      clips: destClips,
      keyboardCaptionSessions: destKeyboardSessions,
    },
    zoom: {
      elements: destZooms,
      generatedSessions: [],
      motionBlur: firstZoomSettings?.motionBlur || defaultZoomMotionBlur(),
      autoFollow: firstZoomSettings?.autoFollow || defaultZoomAutoFollow(),
    },
    presentation: firstPresentation || newManifest.editor.presentation,
  };
  newManifest.updatedAtUtc = new Date().toISOString();
  writeJsonAtomicSync(path.join(newDir, 'project.json'), newManifest);

  if (options.deleteOriginals === true) {
    onProgress?.({
      current: total,
      total,
      percent: 96,
      completedProjectName: lastCompletedName,
      stage: 'cleaning',
    });
    for (const p of projects) {
      if (p.id === newProjectId) continue;
      try {
        if (p.mode === 'screenshot' && screenshotStore) {
          screenshotStore.remove(p.id);
        } else {
          projectStore.delete(p.id);
        }
      } catch (err) {
        console.error(`Failed to delete source project ${p.id}:`, err);
      }
    }
  }

  onProgress?.({
    current: total,
    total,
    percent: 100,
    completedProjectName: lastCompletedName,
    stage: 'done',
  });

  return projectStore.summaryForDirectory(newDir, newManifest, newProjectId);
}

module.exports = { combineProjects };
