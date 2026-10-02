// Shared optical profile: the same broad, soft two-ring light in both worlds.
// The surface shader supplies its own normals and terrain occlusion.
export const flashlightGLSL=`
float flashlightBeam(vec3 fromLamp,vec3 direction){
  float len=length(fromLamp);
  float aim=dot(fromLamp/max(len,.001),direction);
  if(aim<=0.||len>=100.)return 0.;
  float radial=sqrt(max(0.,1.-aim*aim))/max(aim,.001)/1.08;
  float central=1.-smoothstep(.49,.75,radial);
  float ring=exp(-pow((radial-.82)/.055,2.))*.16;
  float spill=(1.-smoothstep(.79,1.03,radial))*.15;
  return (central+ring+spill)*smoothstep(0.,.08,aim)
    *(1.-smoothstep(75.,100.,len))*2.8/(1.+len*len/170.);
}`;
