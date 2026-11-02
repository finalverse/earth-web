import { test } from 'node:test';
import assert from 'node:assert/strict';
import { objectPose, lightLevel, fillLevel, canSelect } from '../alpha/native-state.js';

test('whole-object placement survives camera changes, edition serialization and reapplication', () => {
  const chair = { id: 'chair', translation: [2.3, 0, 0.6], yaw_degrees: -25, scale: 1, editable: true };
  const doc = { objects: [chair], lights: [] };
  doc.objects[0].translation[0] += 1;
  const moved = objectPose(doc, chair);
  // Every part uses this one group pose; no material parts or camera coordinates enter it.
  for (const camera of [[0, 0, 0], [8, 2, -4], [-3, 1, 2]]) {
    const reopened = JSON.parse(JSON.stringify(doc));
    assert.deepEqual(objectPose(reopened, reopened.objects[0]), moved);
    assert.equal(moved.position[0], 3.3);
    assert.equal(camera.length, 3);
  }
});
test('doors rotate about their authored hinge without moving the architecture', () => {
  const door = { id: 'door', translation: [4.9, 0, 2.1], yaw_degrees: 90, scale: 1, editable: false };
  const doc = { retreat: { doors: [{ object: 'door', open: false }] } };
  assert.equal(canSelect(doc, door), true);
  assert.equal(objectPose(doc, door).yaw, 90);
  doc.retreat.doors[0].open = true;
  assert.deepEqual(objectPose(doc, door), { position: [4.9, 0, 2.1], yaw: 180, scale: 1 });
});
test('indirect warm fill and flame state follow approved switch levels, including all off', () => {
  const lamp = { object: 'lamp', enabled: true, brightness_milli: 1000 };
  const fire = { object: 'fire', enabled: true, brightness_milli: 500 };
  const doc = { lights: [lamp, fire, { object: null, enabled: true, brightness_milli: 1000 }] };
  assert.equal(fillLevel(doc), 0.75);
  lamp.enabled = fire.enabled = false;
  assert.equal(lightLevel(fire), 0);
  assert.equal(fillLevel(doc), 0);
});
