import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transform, toEnu, fromEnu } from '../core/geo.js';
const near=(a,b,eps)=>assert.ok(Math.abs(a-b)<eps,`${a} vs ${b}`);
test('ECEF and local ENU preserve antimeridian, polar and altitude positions',()=>{
  for(const p of [[179.9999,0,700],[-179.9999,0,-20],[10,89.99999,1234],[-73.5673,45.5017,45]]){
    const back=transform(transform(p,'EPSG:4979','EPSG:4978'),'EPSG:4978','EPSG:4979');
    back.forEach((v,i)=>near(v,p[i],i===2?0.001:1e-7));
    const anchor=[p[0],Math.min(p[1]+0.00001,90),p[2]+10];
    fromEnu(toEnu(p,anchor),anchor).forEach((v,i)=>near(v,p[i],i===2?0.001:1e-7));
  }
  const local=toEnu([-179.9999,0,0],[179.9999,0,0]);
  assert.ok(local[0]>20&&local[0]<23,'antimeridian origin is continuous in metres');
});
test('projected metre coordinates round-trip; unsupported CRS and polar Mercator fail',()=>{
  const p=[-73.5673,45.5017,55];
  const xy=transform(p,'EPSG:4979','EPSG:3857');
  near(xy[0],-8189474.375,0.001);near(xy[2],55,1e-9);
  transform(xy,'EPSG:3857','EPSG:4979').forEach((v,i)=>near(v,p[i],1e-7));
  assert.throws(()=>transform([0,89,0],'EPSG:4979','EPSG:3857'));
  assert.throws(()=>transform([0,22000000,0],'EPSG:3857','EPSG:4979'));
  assert.throws(()=>transform(p,'EPSG:9999','EPSG:4979'));
  const shifted=fromEnu([12,-4,2],p), local=toEnu(shifted,p);
  local.forEach((v,i)=>near(v,[12,-4,2][i],0.001));
});
