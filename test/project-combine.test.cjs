const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { combineProjects } = require('../apps/desktop/electron/projects/project-combine.cjs');

function setupTestEnvironment(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-combine-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createProjectStore(root);
  return { root, store };
}

function createProjectWithClips(store, name, clips, durationMs) {
  const summary = store.create({ name });
  const dir = store.directoryFor(summary.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));
  manifest.editor = {
    schemaVersion: 3,
    applyGlobalDefaults: false,
    composition: {
      schemaVersion: 14,
      durationMs,
      assets: [
        {
          id: `asset-${summary.id}`,
          kind: 'video',
          name: 'Video',
          fileName: null,
          durationMs,
          width: 1920,
          height: 1080,
          origin: 'project',
        },
      ],
      clips: clips.map((clip, index) => ({
        id: `clip-${summary.id}-${index}`,
        kind: 'video',
        name: clip.name || 'Clip',
        assetId: `asset-${summary.id}`,
        timelineStartMs: clip.startMs,
        timelineDurationMs: clip.durationMs,
        sourceInMs: 0,
        sourceDurationMs: clip.durationMs,
        playbackRate: 1,
        transitions: { entry: null, exit: null },
        enabled: true,
        order: 30000 + index,
        trackId: 'track-1',
        transform: { x: 0, y: 0, width: 1, height: 1 },
      })),
      keyboardCaptionSessions: [],
    },
    zoom: {
      elements: [
        {
          id: `zoom-${summary.id}`,
          sessionId: 'sess-1',
          startMs: 100,
          endMs: 500,
          focus: { cx: 0.5, cy: 0.5 },
          depth: 2,
          mode: 'manual',
        },
      ],
      generatedSessions: [],
      motionBlur: { enabled: true, intensity: 0.5 },
      autoFollow: { enabled: false },
    },
    presentation: {
      canvas: { width: 1920, height: 1080, showBackground: true },
      cursor: { enabled: true },
    },
  };
  fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify(manifest));
  return store.get(summary.id);
}

test('combineProjects requires at least two projects', (t) => {
  const { store } = setupTestEnvironment(t);
  assert.throws(() => combineProjects(store, null, []), /At least two projects/);
  assert.throws(() => combineProjects(store, null, ['id-1']), /At least two projects/);
});

test('combineProjects rejects non-existent projects', (t) => {
  const { store } = setupTestEnvironment(t);
  const p1 = store.create({ name: 'Project 1' });
  assert.throws(
    () => combineProjects(store, null, [p1.id, '00000000-0000-0000-0000-000000000000']),
    /not found/,
  );
});

test('combineProjects combines two projects in order and preserves originals when deleteOriginals is false', (t) => {
  const { store } = setupTestEnvironment(t);
  const p1 = createProjectWithClips(store, 'First Part', [{ startMs: 0, durationMs: 4000 }], 4000);
  const p2 = createProjectWithClips(store, 'Second Part', [{ startMs: 0, durationMs: 6000 }], 6000);

  const combined = combineProjects(store, null, [p1.id, p2.id], {
    name: 'Merged Show',
    deleteOriginals: false,
  });

  assert.equal(combined.name, 'Merged Show');
  const dir = store.directoryFor(combined.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));

  assert.equal(manifest.editor.composition.clips.length, 2);
  const clip1 = manifest.editor.composition.clips[0];
  const clip2 = manifest.editor.composition.clips[1];

  assert.equal(clip1.timelineStartMs, 0);
  assert.equal(clip1.timelineDurationMs, 4000);

  // Second clip shifted by first project duration (4000ms)
  assert.equal(clip2.timelineStartMs, 4000);
  assert.equal(clip2.timelineDurationMs, 6000);

  assert.equal(manifest.editor.composition.durationMs, 10000);

  // Zooms shifted
  assert.equal(manifest.editor.zoom.elements.length, 2);
  assert.equal(manifest.editor.zoom.elements[0].startMs, 100);
  assert.equal(manifest.editor.zoom.elements[0].endMs, 500);
  assert.equal(manifest.editor.zoom.elements[1].startMs, 4100);
  assert.equal(manifest.editor.zoom.elements[1].endMs, 4500);

  // Original projects still exist
  assert.ok(store.get(p1.id));
  assert.ok(store.get(p2.id));
});

test('combineProjects deletes originals when deleteOriginals is true', (t) => {
  const { store } = setupTestEnvironment(t);
  const p1 = createProjectWithClips(store, 'Intro', [{ startMs: 0, durationMs: 3000 }], 3000);
  const p2 = createProjectWithClips(store, 'Outro', [{ startMs: 0, durationMs: 3000 }], 3000);

  const combined = combineProjects(store, null, [p1.id, p2.id], {
    name: 'Final Video',
    deleteOriginals: true,
  });

  assert.equal(combined.name, 'Final Video');
  assert.ok(store.get(combined.id));

  // Originals should be deleted
  assert.throws(() => store.get(p1.id), /Projet introuvable/);
  assert.throws(() => store.get(p2.id), /Projet introuvable/);
});

test('combineProjects handles reordered sequencing', (t) => {
  const { store } = setupTestEnvironment(t);
  const pA = createProjectWithClips(store, 'A', [{ startMs: 0, durationMs: 2000 }], 2000);
  const pB = createProjectWithClips(store, 'B', [{ startMs: 0, durationMs: 5000 }], 5000);

  // Reverse order: B first, then A
  const combined = combineProjects(store, null, [pB.id, pA.id], {
    name: 'B then A',
    deleteOriginals: false,
  });

  const dir = store.directoryFor(combined.id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'project.json'), 'utf8'));

  assert.equal(manifest.editor.composition.clips.length, 2);
  // B was 5000ms
  assert.equal(manifest.editor.composition.clips[0].timelineStartMs, 0);
  assert.equal(manifest.editor.composition.clips[0].timelineDurationMs, 5000);
  // A starts after B (at 5000ms)
  assert.equal(manifest.editor.composition.clips[1].timelineStartMs, 5000);
  assert.equal(manifest.editor.composition.clips[1].timelineDurationMs, 2000);
  assert.equal(manifest.editor.composition.durationMs, 7000);
});

test('combineProjects reports progress and status events', (t) => {
  const { store } = setupTestEnvironment(t);
  const p1 = createProjectWithClips(store, 'Video 1', [{ startMs: 0, durationMs: 3000 }], 3000);
  const p2 = createProjectWithClips(store, 'Video 2', [{ startMs: 0, durationMs: 4000 }], 4000);

  const progressEvents = [];
  const combined = combineProjects(store, null, [p1.id, p2.id], {
    name: 'Progress Combined',
    onProgress: (p) => progressEvents.push(p),
  });

  assert.ok(combined.id);
  assert.ok(progressEvents.length >= 4);

  const stages = progressEvents.map((e) => e.stage);
  assert.ok(stages.includes('preparing'));
  assert.ok(stages.includes('processing'));
  assert.ok(stages.includes('processed'));
  assert.ok(stages.includes('finalizing'));
  assert.ok(stages.includes('done'));

  const processedEvents = progressEvents.filter((e) => e.stage === 'processed');
  assert.ok(processedEvents.some((e) => e.completedProjectName === 'Video 1'));
  assert.ok(processedEvents.some((e) => e.completedProjectName === 'Video 2'));

  const lastEvent = progressEvents[progressEvents.length - 1];
  assert.equal(lastEvent.percent, 100);
  assert.equal(lastEvent.stage, 'done');
});
