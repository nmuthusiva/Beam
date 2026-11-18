const fs = require('node:fs');
const path = require('node:path');

function createProjectSummary({ category, detectProjectFeatures, previewFor, thumbnailFor }) {
  return (directory, manifest, fallbackId) => {
    const sessions = Array.isArray(manifest.sessions) ? manifest.sessions : [];
    const id = typeof manifest.projectId === 'string' ? manifest.projectId : fallbackId;
    const { hasScreen, hasCamera, hasCaption, hasSystemAudio, hasMicrophone } = detectProjectFeatures(
      directory,
      manifest,
      sessions,
    );
    let durationMs = 0;
    if (manifest.editor?.composition) {
      const comp = manifest.editor.composition;
      if (typeof comp.durationMs === 'number' && Number.isFinite(comp.durationMs) && comp.durationMs > 0) {
        durationMs = Math.round(comp.durationMs);
      } else if (Array.isArray(comp.clips) && comp.clips.length > 0) {
        for (const clip of comp.clips) {
          if (clip && Number.isFinite(clip.timelineStartMs) && Number.isFinite(clip.timelineDurationMs)) {
            durationMs = Math.max(durationMs, Math.round(clip.timelineStartMs + clip.timelineDurationMs));
          }
        }
      }
    }
    if (durationMs === 0 && sessions.length > 0) {
      for (const session of sessions) {
        try {
          const sessionDir = path.join(directory, session?.relativePath || `session-${session?.sessionId}`);
          const manifestFile = [
            path.join(sessionDir, 'manifest.json'),
            path.join(sessionDir, 'manifest.partial.json'),
          ].find((f) => fs.existsSync(f));
          if (manifestFile) {
            const sm = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
            if (sm?.durationNs && Number.isFinite(sm.durationNs)) {
              durationMs += Math.max(0, Math.round(sm.durationNs / 1_000_000));
            }
          }
        } catch {}
      }
    }
    return {
      id,
      name:
        typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : `Project ${id.slice(0, 8)}`,
      createdAt: typeof manifest.createdAtUtc === 'string' ? manifest.createdAtUtc : '',
      updatedAt: typeof manifest.updatedAtUtc === 'string' ? manifest.updatedAtUtc : '',
      mode: category && path.basename(path.dirname(directory)) === 'instant' ? 'instant' : 'studio',
      sessionCount: sessions.length,
      previewSrc: previewFor(directory, manifest, sessions),
      thumbnailSrc: thumbnailFor(directory),
      durationMs,
      hasScreen,
      hasCamera,
      hasCaption,
      hasSystemAudio,
      hasMicrophone,
    };
  };
}

module.exports = { createProjectSummary };
