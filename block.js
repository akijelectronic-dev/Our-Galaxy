/* ======================================================================
   NEW FEATURES (added on top of the original code; nothing above is changed
   except one extras(d) call at the end of update())
   ====================================================================== */
const _q=new THREE.Vector3(),_w=new THREE.Vector3(),_x=new THREE.Vector3(),_y=new THREE.Vector3(),_z=new THREE.Vector3(),_m=new THREE.Matrix4();
const TAU=Math.PI*2;
function mkGlow(rgb){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);
  g.addColorStop(0,'rgba('+rgb+',1)');g.addColorStop(.25,'rgba('+rgb+',.55)');g.addColorStop(1,'rgba('+rgb+',0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
function xLabel(name,obj,css){addLabel(name,obj);const el=labels[labels.length-1].el;if(css)el.style.cssText+=css;return el;}
let tw=null; // camera tween used by the click-to-zoom feature
cv.style.touchAction='none';

/* ---------------- Feature 1: real-time satellites ---------------- */
const EARTH=P.find(p=>p.n==='Earth');
// Placeholder TLEs (realistic orbit shapes). With REFRESH_EPOCH=true the epoch is re-stamped to "now" at load so
// SGP4 stays well-behaved. For true live positions paste fresh TLEs from celestrak.org and set REFRESH_EPOCH=false.
const REFRESH_EPOCH=true;
const SATS=[
 {n:'ISS',rgb:'0,229,255',col:0x00e5ff,
  l1:'1 25544U 98067A   26300.50000000  .00016717  00000-0  10270-3 0  9991',
  l2:'2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.50040000563536'},
 {n:'Bangabandhu-1',rgb:'80,255,140',col:0x50ff8c,
  l1:'1 43551U 18039A   26300.50000000  .00000012  00000-0  00000-0 0  9998',
  l2:'2 43551   0.0213 276.3510 0002214 148.0120 211.3340  1.00271200 21454'},
 {n:'Starlink-1007',rgb:'255,214,102',col:0xffd666,
  l1:'1 44713U 19074A   26300.50000000  .00001850  00000-0  14250-3 0  9995',
  l2:'2 44713  53.0536 115.4021 0001432  92.7340 267.4190 15.06391200600127'}
];
function tleNow(l1){
  const n=new Date(),y=n.getUTCFullYear(),doy=1+(n-Date.UTC(y,0,1))/864e5;
  const ep=String(y%100).padStart(2,'0')+doy.toFixed(8).padStart(12,'0');
  l1=l1.slice(0,18)+ep+l1.slice(32,68);
  let c=0;for(const ch of l1){if(ch>='0'&&ch<='9')c+=+ch;else if(ch==='-')c++;}
  return l1+(c%10);
}
const sats=[];
if(typeof satellite!=='undefined'){
  for(const s of SATS){
    try{
      const rec=satellite.twoline2satrec(REFRESH_EPOCH?tleNow(s.l1):s.l1,s.l2);
      const g=new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(.014,12,8),new THREE.MeshBasicMaterial({color:s.col})));
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:mkGlow(s.rgb),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));
      sp.scale.set(.16,.16,1);g.add(sp);g.visible=false;scene.add(g);
      const el=xLabel(s.n,g,';color:rgb('+s.rgb+');font-size:10px;visibility:hidden');
      sats.push({rec,g,el,ep:Date.now()});
    }catch(e){/* bad TLE: skip this satellite */}
  }
}
function updateSats(d){
  if(!sats.length)return;
  const base=EARTH.g.position,R=EARTH.r,near=camera.position.distanceTo(base)<6;
  for(const s of sats){
    let t=d.getTime();const off=t-s.ep,span=7*864e5; // keep SGP4 inside its valid window at high sim speeds
    if(Math.abs(off)>span)t=s.ep+(((off%span)+span)%span);
    let pv=null;try{pv=satellite.propagate(s.rec,new Date(t)).position;}catch(e){}
    if(!pv||typeof pv.x!=='number'||isNaN(pv.x)){s.g.visible=false;s.el.style.visibility='hidden';continue;}
    const rk=Math.hypot(pv.x,pv.y,pv.z),alt=Math.max(rk-6371,0);
    // true ECI direction, exaggerated radius (LEO hugs the globe, GEO stays inside the Moon's drawn orbit)
    const rv=R*(1.15+1.1*Math.sqrt(alt/35786));
    s.g.position.copy(base).addScaledVector(toScene(toEcl(pv),1/rk),rv);
    s.g.visible=true;s.el.style.visibility=near?'visible':'hidden';
  }
}
{
  const earthBtn=[...chipBox.children].find(b=>b.textContent==='Earth');
  const satBtn=document.createElement('button');satBtn.textContent='Satellites';satBtn.title='Zoom to Earth and its satellites';
  satBtn.onclick=()=>{tw=null;setView('Earth',satBtn);
    const dir=camera.position.clone().sub(EARTH.g.position).normalize();camera.position.copy(EARTH.g.position).addScaledVector(dir,1.9);};
  chipBox.insertBefore(satBtn,earthBtn?earthBtn.nextSibling:null);
  chipBox.addEventListener('click',e=>{if(e.target!==satBtn)tw=null;},true); // any chip cancels a running zoom
}

/* ---------------- Feature 2: click-to-info popups ---------------- */
const INFO={
 Sun:{type:'Star · G-type main sequence',color:'#ffcf6b',
  desc:'The star at the centre of our solar system: a vast ball of hot plasma holding about 99.86% of the system’s mass. Its gravity keeps every planet in orbit and its light powers nearly all life on Earth.',
  facts:['Sunlight takes about 8 minutes 20 seconds to reach Earth.','Around 1.3 million Earths could fit inside the Sun, and its core burns at roughly 15 million °C.']},
 Mercury:{type:'Terrestrial planet',color:'#8c8680',
  desc:'The smallest planet and the closest to the Sun. A cratered, airless world that looks a lot like our Moon.',
  facts:['A year lasts only 88 Earth days, yet one sunrise-to-sunrise day takes about 176 Earth days.','Surface temperatures swing from around 430 °C by day to about −180 °C at night.']},
 Venus:{type:'Terrestrial planet',color:'#d9b36b',
  desc:'Earth’s size-twin, hidden under thick clouds of carbon dioxide and sulphuric acid. A runaway greenhouse effect makes it the hottest planet.',
  facts:['Venus spins backwards, and so slowly that its day (243 Earth days) is longer than its year (225).','The surface sits near 465 °C, hot enough to melt lead, with pressure about 92 times Earth’s.']},
 Earth:{type:'Terrestrial planet',color:'#3f8fd8',
  desc:'Our home and the only world known to host life. About 71% of its surface is liquid water, wrapped in a nitrogen-oxygen atmosphere.',
  facts:['Earth is the densest planet in the solar system.','At the equator the ground moves about 1,670 km/h, while Earth orbits the Sun at roughly 107,000 km/h.']},
 Mars:{type:'Terrestrial planet',color:'#c4623a',
  desc:'A cold, dusty desert world whose iron-rich soil gives it a rusty colour. Ancient river valleys show that water once flowed here.',
  facts:['Olympus Mons, a volcano about 22 km high, is roughly 2.5 times taller than Mount Everest.','Its moon Phobos is spiralling inward and should break apart or crash in around 50 million years.']},
 Jupiter:{type:'Gas giant',color:'#d8b48a',
  desc:'The largest planet, a gas giant with more than twice the mass of all the other planets combined. Its banded clouds are shaped by fierce, fast-spinning storms.',
  facts:['The Great Red Spot is a storm wider than Earth that has been observed for well over 150 years.','Its moon Ganymede is the largest moon in the solar system, bigger than the planet Mercury.']},
 Saturn:{type:'Gas giant',color:'#e3cf9d',
  desc:'A gas giant best known for its spectacular rings, made of countless chunks of ice and rock from dust grains to house-sized boulders.',
  facts:['Saturn is the least dense planet; its average density is lower than water’s.','The main rings stretch for hundreds of thousands of kilometres yet are often only about 10 metres to 1 km thick.']},
 Uranus:{type:'Ice giant',color:'#8fd6dc',
  desc:'A pale cyan ice giant whose colour comes from methane in its atmosphere. It orbits the Sun tilted almost 98°, effectively rolling on its side.',
  facts:['It was the first planet found with a telescope, spotted by William Herschel in 1781.','Its atmosphere is the coldest of any planet, dropping to about −224 °C.']},
 Neptune:{type:'Ice giant',color:'#3e62d8',
  desc:'The most distant planet: a dark, cold, windy ice giant with a deep blue tint. Sunlight there is about 900 times dimmer than on Earth.',
  facts:['Its winds reach roughly 2,000 km/h, the fastest measured on any planet.','Neptune was located by mathematics before it was seen, in 1846, and takes about 165 Earth years to orbit the Sun.']}
};
const info=$('info');
function closeInfo(){info.classList.remove('open');info.setAttribute('aria-hidden','true');}
function zoomTo(name){
  const o=objs[name];if(!o)return;
  follow=null;[...chipBox.children].forEach(x=>x.classList.remove('on'));
  const tp=o.obj.position,cur=camera.position.distanceTo(tp);
  tw={name,o,t:0,last:performance.now(),T0:controls.target.clone(),C0:camera.position.clone(),
      dir:camera.position.clone().sub(tp).normalize(),end:Math.min(cur,Math.max(cur*.55,o.r*6))};
}
function stepTween(){
  if(!tw)return;
  const now=performance.now();tw.t=Math.min(1,tw.t+(now-tw.last)/1100);tw.last=now;
  const t=tw.t,e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2,tp=tw.o.obj.position;
  controls.target.lerpVectors(tw.T0,tp,e);
  _q.copy(tp).addScaledVector(tw.dir,tw.end);camera.position.lerpVectors(tw.C0,_q,e);
  if(t>=1){follow=tw.o.obj;const nm=tw.name;[...chipBox.children].forEach(x=>x.classList.toggle('on',x.textContent===nm));tw=null;}
}
function openInfo(name){
  const d=INFO[name];if(!d)return;
  $('infoName').textContent=name;$('infoType').textContent=d.type;$('infoDesc').textContent=d.desc;
  $('infoFacts').innerHTML=d.facts.map(f=>'<li>'+f+'</li>').join('');
  $('infoDot').style.background=d.color;$('infoDot').style.boxShadow='0 0 10px '+d.color;
  info.scrollTop=0;info.classList.add('open');info.setAttribute('aria-hidden','false');
  zoomTo(name);
}
$('infoX').onclick=closeInfo;
addEventListener('keydown',e=>{if(e.key==='Escape')closeInfo();});
// Invisible, slightly oversized pick spheres (they grow with camera distance so tiny far-away planets stay tappable)
const pickables=[];
function addPick(name,parent,r){
  const m=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial());
  m.visible=false;m.userData={name,r:r*1.05};m.scale.setScalar(r*1.05);parent.add(m);pickables.push(m);
}
addPick('Sun',sun,1.6);P.forEach(p=>addPick(p.n,p.g,p.r));
function sizePickables(){
  for(const m of pickables){m.getWorldPosition(_w);m.scale.setScalar(Math.max(m.userData.r,camera.position.distanceTo(_w)*.03));}
}
const rc=new THREE.Raycaster(),ndc=new THREE.Vector2();let pd=null;
cv.addEventListener('pointerdown',e=>{pd={x:e.clientX,y:e.clientY,t:performance.now()};});
cv.addEventListener('pointercancel',()=>{pd=null;});
cv.addEventListener('pointerup',e=>{
  if(!pd)return;
  const moved=Math.hypot(e.clientX-pd.x,e.clientY-pd.y),dur=performance.now()-pd.t;pd=null;
  if(moved>6||dur>600)return; // a drag / long press is camera control, not a click
  ndc.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);
  rc.setFromCamera(ndc,camera);
  const hits=rc.intersectObjects(pickables,false);
  if(!hits.length){closeInfo();return;}
  let best=null,bs=Infinity;
  for(const h of hits){h.object.getWorldPosition(_w);const s=rc.ray.distanceToPoint(_w)/camera.position.distanceTo(_w);if(s<bs){bs=s;best=h.object;}}
  openInfo(best.userData.name);
});

/* ---------------- Feature 3: advanced space objects ---------------- */
// Asteroid belt (~2.1-3.3 AU, between Mars and Jupiter)
const belt=(()=>{
  const n=4200,pos=new Float32Array(n*3),col=new Float32Array(n*3),R=rng(2024);
  for(let i=0;i<n;i++){
    const a=R()*TAU,r=21.5+(R()+R()+R())/3*11.5,y=(R()+R()-1)*(.5+(r-21)*.05),k=.45+R()*.4;
    pos[i*3]=Math.cos(a)*r;pos[i*3+1]=y;pos[i*3+2]=-Math.sin(a)*r;col[i*3]=k;col[i*3+1]=k*.92;col[i*3+2]=k*.82;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
  const m=new THREE.Points(g,new THREE.PointsMaterial({size:1.5,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:.9,depthWrite:false}));
  scene.add(m);return m;
})();
const beltTag=new THREE.Object3D();beltTag.position.set(0,0,27);belt.add(beltTag);
const beltEl=xLabel('Asteroid belt',beltTag,';font-size:10px;opacity:.6');

// Faint rings for Uranus (tilted ~98°) and Neptune (~28°)
function addRings(name,tilt,defs,color){
  const p=P.find(q=>q.n===name);if(!p)return;
  const pivot=new THREE.Group();pivot.rotation.z=tilt;
  for(const [a,b,o] of defs){
    const rg=new THREE.Mesh(new THREE.RingGeometry(p.r*a,p.r*b,96),new THREE.MeshBasicMaterial({color,transparent:true,opacity:o,side:THREE.DoubleSide,depthWrite:false}));
    rg.rotation.x=Math.PI/2;pivot.add(rg);
  }
  p.g.add(pivot);
}
addRings('Uranus',97.77*Math.PI/180,[[1.55,1.75,.3],[1.95,2.0,.22]],0xbfe6ea);
addRings('Neptune',28.3*Math.PI/180,[[1.45,1.55,.2],[1.75,1.95,.14],[2.2,2.28,.2]],0x8da2e6);

// Comet on a ~5.7-year ellipse (placeholder elements), tail always points away from the Sun
const CM={a:3.2,e:.72,i:20*Math.PI/180,O:80*Math.PI/180,w:50*Math.PI/180,M0:-.9};
CM.n=TAU/(Math.pow(CM.a,1.5)*365.25);
function cometAt(M,out){
  M=((M+Math.PI)%TAU+TAU)%TAU-Math.PI;
  let E=CM.e>.8?Math.PI:M;for(let k=0;k<9;k++)E-=(E-CM.e*Math.sin(E)-M)/(1-CM.e*Math.cos(E));
  const xp=CM.a*(Math.cos(E)-CM.e),yp=CM.a*Math.sqrt(1-CM.e*CM.e)*Math.sin(E);
  const cw=Math.cos(CM.w),sw=Math.sin(CM.w),ci=Math.cos(CM.i),si=Math.sin(CM.i),cn=Math.cos(CM.O),sn=Math.sin(CM.O);
  const x1=xp*cw-yp*sw,y1=xp*sw+yp*cw;
  const x=x1*cn-y1*ci*sn,y=x1*sn+y1*ci*cn,z=y1*si;
  return out.set(x*AU,z*AU,-y*AU);
}
{const pts=[];for(let k=0;k<=160;k++)pts.push(cometAt(-Math.PI+k/160*TAU,new THREE.Vector3()));
 scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x3d7f8f,transparent:true,opacity:.45})));}
const comet=new THREE.Group(),tailG=new THREE.Group();
comet.add(new THREE.Mesh(new THREE.SphereGeometry(.09,16,12),new THREE.MeshBasicMaterial({color:0xe6eeff})));
{const s=new THREE.Sprite(new THREE.SpriteMaterial({map:mkGlow('170,220,255'),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));s.scale.set(1.5,1.5,1);comet.add(s);}
function mkTail(n,len,spread,curve,rgb,seed){
  const R=rng(seed),pos=new Float32Array(n*3),col=new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const t=Math.pow(R(),1.4),w=spread*t;
    pos[i*3]=t*len;pos[i*3+1]=curve*t*t+(R()+R()+R()-1.5)*w;pos[i*3+2]=(R()+R()+R()-1.5)*w;
    const f=Math.pow(1-t,1.2)*.95;col[i*3]=rgb[0]*f;col[i*3+1]=rgb[1]*f;col[i*3+2]=rgb[2]*f;
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('color',new THREE.BufferAttribute(col,3));
  return new THREE.Points(g,new THREE.PointsMaterial({size:2.2,sizeAttenuation:false,vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
}
tailG.add(mkTail(260,1,.22,-.16,[1,.85,.6],31)); // curved, yellowish dust tail
tailG.add(mkTail(200,1.35,.08,0,[.45,.7,1],32)); // straight, blue ion tail
comet.add(tailG);scene.add(comet);
xLabel('Comet',comet,';font-size:10px;color:#bfe3ff');
const cPrev=new THREE.Vector3(),cNext=new THREE.Vector3();
function updateComet(d){
  const days=(d.getTime()-t0)/864e5,M=CM.M0+CM.n*days;
  cometAt(M,cPrev);comet.position.copy(cPrev);cometAt(M+CM.n,cNext);
  const rAU=cPrev.length()/AU;
  _x.copy(cPrev).normalize();                                   // anti-sunward
  _y.copy(cNext).sub(cPrev).multiplyScalar(-1);_y.addScaledVector(_x,-_y.dot(_x)).normalize(); // dust curves back along the orbit
  _z.crossVectors(_x,_y);_m.makeBasis(_x,_y,_z);tailG.quaternion.setFromRotationMatrix(_m);
  tailG.scale.setScalar(Math.min(30,Math.max(3.5,22/rAU)));
}

// Jupiter's moons: Europa and Ganymede (orbit sizes compressed to suit the exaggerated planet)
const JUP=P.find(p=>p.n==='Jupiter'),jm=new THREE.Group();scene.add(jm);
const JM=[
 {n:'Europa',R:1.9,r:.07,per:3.551,ph:1.2,tex:{base:'#d8cdb4',sp:[['#a68a64',40,1,4,.5],['#8a6a4a',24,1,3,.4]]},seed:301},
 {n:'Ganymede',R:3.0,r:.1,per:7.155,ph:3.9,tex:{base:'#8f8576',sp:[['#6b6258',90,2,10,.6],['#b5ab9b',50,1,6,.5]]},seed:302}
];
for(const m of JM){
  m.mesh=new THREE.Mesh(new THREE.SphereGeometry(m.r,24,16),new THREE.MeshPhongMaterial({map:mkTex(m.tex,m.seed),shininess:2}));
  jm.add(m.mesh);
  const pts=[];for(let k=0;k<=64;k++){const a=k/64*TAU;pts.push(new THREE.Vector3(Math.cos(a)*m.R,Math.sin(a)*m.R*.05,-Math.sin(a)*m.R));}
  jm.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x4a5a86,transparent:true,opacity:.35})));
  m.el=xLabel(m.n,m.mesh,';font-size:10px;visibility:hidden');
}
function updateJMoons(d){
  jm.position.copy(JUP.g.position);
  const days=d.getTime()/864e5,near=camera.position.distanceTo(JUP.g.position)<25;
  for(const m of JM){const a=m.ph+TAU*days/m.per;m.mesh.position.set(Math.cos(a)*m.R,Math.sin(a)*m.R*.05,-Math.sin(a)*m.R);m.el.style.visibility=near?'visible':'hidden';}
}

// Constellations: real RA/Dec (J2000) drawn as faint lines just inside the background star sphere
const CONS=[
 {n:'Big Dipper',s:{Dubhe:[11.062,61.75],Merak:[11.031,56.38],Phecda:[11.897,53.69],Megrez:[12.257,57.03],Alioth:[12.9,55.96],Mizar:[13.399,54.93],Alkaid:[13.792,49.31]},
  l:[['Dubhe','Merak'],['Merak','Phecda'],['Phecda','Megrez'],['Megrez','Dubhe'],['Megrez','Alioth'],['Alioth','Mizar'],['Mizar','Alkaid']]},
 {n:'Orion',s:{Meissa:[5.585,9.93],Betelgeuse:[5.92,7.41],Bellatrix:[5.419,6.35],Mintaka:[5.533,-0.3],Alnilam:[5.603,-1.2],Alnitak:[5.679,-1.94],Saiph:[5.796,-9.67],Rigel:[5.242,-8.2]},
  l:[['Meissa','Betelgeuse'],['Meissa','Bellatrix'],['Betelgeuse','Alnitak'],['Bellatrix','Mintaka'],['Mintaka','Alnilam'],['Alnilam','Alnitak'],['Alnitak','Saiph'],['Mintaka','Rigel']]},
 {n:'Cassiopeia',s:{Caph:[.153,59.15],Schedar:[.675,56.54],Gamma:[.945,60.72],Ruchbah:[1.43,60.24],Segin:[1.907,63.67]},
  l:[['Caph','Schedar'],['Schedar','Gamma'],['Gamma','Ruchbah'],['Ruchbah','Segin']]},
 {n:'Southern Cross',s:{Acrux:[12.443,-63.1],Mimosa:[12.795,-59.69],Gacrux:[12.519,-57.11],Imai:[12.253,-58.75]},
  l:[['Acrux','Gacrux'],['Mimosa','Imai']]}
];
{
  const CR=2790,segs=[],dots=[];
  const dir=(ra,de)=>{const a=ra*15*Math.PI/180,b=de*Math.PI/180;return toScene(toEcl({x:Math.cos(b)*Math.cos(a),y:Math.cos(b)*Math.sin(a),z:Math.sin(b)}),CR);};
  for(const c of CONS){
    const p={},ctr=new THREE.Vector3();
    for(const k in c.s){p[k]=dir(c.s[k][0],c.s[k][1]);dots.push(p[k]);ctr.add(p[k]);}
    for(const [a,b] of c.l)segs.push(p[a],p[b]);
    const tag=new THREE.Object3D();tag.position.copy(ctr.multiplyScalar(1/Object.keys(c.s).length));
    xLabel(c.n,tag,';font-size:10px;font-style:italic;color:#8fa8e0;opacity:.5');
  }
  scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs),new THREE.LineBasicMaterial({color:0x7f9de0,transparent:true,opacity:.3,depthWrite:false})));
  scene.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(dots),new THREE.PointsMaterial({color:0xcfdcff,size:3,sizeAttenuation:false,transparent:true,opacity:.85,depthWrite:false})));
}

// Called once per frame from update()
function extras(d){
  belt.rotation.y=(d.getTime()-t0)/864e5/(4.6*365.25)*TAU;
  beltEl.style.visibility=camera.position.length()<150?'visible':'hidden';
  updateComet(d);updateJMoons(d);updateSats(d);sizePickables();stepTween();
}
