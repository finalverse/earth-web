// Host-authored material specifications. No textures, mesh edits or external assets.
export const PALETTES = {
  winter_stone: ['#514d62', '#6a5351', '#625342', '#3c5965', '#765d58'],
  heritage_stone: ['#796453', '#8b604b', '#5c5c55', '#694539', '#9a7d5d'],
  copper_glass: ['#566a70', '#8a6251', '#626f7a', '#3f5968', '#a48362'],
  midnight_neon: ['#302e55', '#2d455c', '#453453', '#284f56', '#483f67'],
};
export const DEFAULT_VISUAL = {
  palette: 'heritage_stone',
  warmth_milli: 450,
  snow_milli: 0,
  haze_milli: 140,
  window_glow_milli: 250,
  roughness_milli: 820,
  metallic_milli: 50,
};
export const QUALITY = {
  low: { scale: 0.65, particles: 50, fps: 30, bloom: false, lamps: 8 },
  balanced: { scale: 0.9, particles: 100, fps: 30, bloom: false, lamps: 14 },
  high: { scale: 1, particles: 180, fps: 60, bloom: true, lamps: 20 },
};
export function paletteColor(palette, id) {
  const a = PALETTES[palette] || PALETTES.heritage_stone;
  let n = 0;
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return a[n % a.length];
}
export function intervals(values) {
  if (!values.length) return { samples: 0 };
  const s = [...values].sort((a, b) => a - b);
  return {
    samples: s.length,
    p50_ms: s[Math.floor((s.length - 1) * 0.5)],
    p95_ms: s[Math.floor((s.length - 1) * 0.95)],
    mean_ms: s.reduce((a, b) => a + b, 0) / s.length,
  };
}
export const MATERIAL_SHADER = `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
 vec3 p=fsInput.attributes.positionMC;
 vec3 n=normalize(cross(dFdx(p),dFdy(p)));
 float roof=smoothstep(.55,.85,abs(n.y));
 float wall=1.0-roof;
 float side=abs(n.x)>abs(n.z)?p.z:p.x;
 vec3 stone=u_palette;
 float grain=fract(sin(dot(floor(p*4.0),vec3(12.9898,78.233,31.17)))*43758.5453);
 stone*=.92+.12*grain;
 float courses=step(.955,fract(p.y*.45));
 stone*=1.0-.15*courses*wall;
 vec3 roofColor=mix(stone*.52,vec3(.55,.66,.76),u_snow*.8);
 vec3 base=mix(stone,roofColor,roof);
 vec2 cell=fract(vec2(side/3.8,p.y/3.5));
 float windowMask=step(.24,cell.x)*step(cell.x,.65)*step(.27,cell.y)*step(cell.y,.7)*wall;
 float occupied=step(.46,fract(sin(floor(side/3.8)*12.9898+floor(p.y/3.5)*78.233)*43758.5453));
 base=mix(base,vec3(.025,.06,.095),windowMask*.78);
 vec3 amber=mix(vec3(.45,.65,1.0),vec3(1.0,.52,.14),u_warmth);
 vec3 glow=amber*windowMask*occupied*u_glow*1.35;
 if(u_kind>.5) {
   float paving=step(.94,fract(p.x*.35))+step(.94,fract(p.z*.35));
   base=u_kind<1.5?vec3(.055,.075,.11):mix(vec3(.105,.16,.20),vec3(.38,.46,.55),u_snow*.42);
   base*=1.0-.13*min(paving,1.0);glow=vec3(0.0);
 }
 float lamps=0.0;
 lamps+=1.0/(1.0+dot(p-u_lamp0,p-u_lamp0)*.06);
 lamps+=1.0/(1.0+dot(p-u_lamp1,p-u_lamp1)*.06);
 lamps+=1.0/(1.0+dot(p-u_lamp2,p-u_lamp2)*.06);
 lamps+=1.0/(1.0+dot(p-u_lamp3,p-u_lamp3)*.06);
 glow+=amber*lamps*u_lamps_enabled*(u_kind>.5?.32:.16);
 float dist=length(fsInput.attributes.positionEC);
 float haze=clamp(1.0-exp(-dist*u_haze*.0017),0.0,.6);
 material.diffuse=mix(base*(1.0-u_metallic),vec3(.085,.14,.23),haze);
 material.specular=mix(vec3(.04),base,u_metallic);
 material.roughness=u_kind>.5?.68:u_roughness;
 material.emissive=glow*(1.0-haze)+base*.055;
}`;
