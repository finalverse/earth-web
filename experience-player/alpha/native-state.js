// Pure projection of an approved edition. Camera navigation never mutates this document.
export function objectPose(doc, object) {
  const door = doc.retreat?.doors.find((d) => d.object === object.id);
  return { position: [...object.translation], yaw: object.yaw_degrees + (door?.open ? 90 : 0), scale: object.scale };
}
export function lightLevel(light) {
  return light.enabled ? light.brightness_milli / 1000 : 0;
}
export function fillLevel(doc) {
  const switches = doc.lights.filter((l) => l.object != null);
  return switches.length ? switches.reduce((sum, l) => sum + lightLevel(l), 0) / switches.length : 0;
}
export function canSelect(doc, object) {
  return object.editable || Boolean(doc.retreat?.doors.some((d) => d.object === object.id));
}
