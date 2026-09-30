// Small, offline ASCII landscapes. Perspective and light are drawn with glyphs
// on Canvas so farm and conversation scenery keep the same visual language.
"use strict";
window.UmbraLandscape = (() => {
  const themes = {
    farm: {sky:["#253f4c","#8a9c73"], ground:["#2b492e","#142d22"], light:"#ffd591", hill:"#5d8068", tree:"#5e8c5b"},
    dawn: {sky:["#333f64","#c8906a"], ground:["#545c47","#262c31"], light:"#ffcf91", hill:"#887c72", tree:"#61755b"},
    forest: {sky:["#192d36","#52715c"], ground:["#284a37","#0f2822"], light:"#d2d99a", hill:"#426b56", tree:"#528b66"},
    shore: {sky:["#243b58","#8ca9a5"], ground:["#255969","#102d46"], light:"#f5dda3", hill:"#607f8b", tree:"#528978"},
    stars: {sky:["#101b35","#344864"], ground:["#273738","#101c26"], light:"#d6e4ff", hill:"#4b6476", tree:"#506e72"},
  };
  const glyph = (g,ch,x,y,color,size=9,alpha=1) => {
    g.globalAlpha=alpha;g.fillStyle=color;g.font=`700 ${size}px monospace`;g.textAlign="center";g.textBaseline="middle";g.fillText(ch,x,y);g.globalAlpha=1;
  };
  function face(g,pts,color,pattern="%#",step=9,alpha=.86){
    g.save();g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.clip();
    g.fillStyle=color;g.globalAlpha=.08;g.fill();g.globalAlpha=1;
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);
    for(let y=Math.min(...ys);y<=Math.max(...ys);y+=step)for(let x=Math.min(...xs);x<=Math.max(...xs);x+=step*.72){
      const k=Math.floor(x/step+y/step),a=alpha*(.83+.17*(1-(y-Math.min(...ys))/(Math.max(...ys)-Math.min(...ys)+1)));
      glyph(g,pattern[Math.abs(k)%pattern.length],x,y,color,step*.96,a);
    }
    g.restore();
  }
  function edge(g,x1,y1,x2,y2,ch,color){
    const n=Math.ceil(Math.hypot(x2-x1,y2-y1)/8);
    for(let i=0;i<=n;i++)glyph(g,ch,x1+(x2-x1)*i/n,y1+(y2-y1)*i/n,color,10,.96);
  }
  function tree(g,x,y,size,p,t){
    const sway=Math.sin(t*.0007+x)*size*.025;
    const dark="#476c50", trunk="#927456";
    for(let a=0;a<5;a++)glyph(g,"|",x,y-a*size*.09,trunk,Math.max(7,size*.13),.9);
    for(let tier=0;tier<3;tier++){
      const top=y-size*(.33+tier*.21),wide=size*(.32-tier*.055);
      face(g,[[x+sway,top],[x-wide+sway,y-size*(.1+tier*.17)],[x+wide+sway,y-size*(.1+tier*.17)]],
        tier===0?p.tree:dark,tier===0?"#%@":"%#",Math.max(7,size*.1),.94);
      for(let i=-2;i<=2;i++)glyph(g,"*",x+sway+i*wide*.36,top+size*.15,p.light,6,.13);
    }
  }
  function cabin(g,t,p){
    const warm=.75+.2*Math.sin(t*.003);
    const glow=g.createRadialGradient(325,178,2,325,178,142);
    glow.addColorStop(0,`rgba(255,191,91,${.22*warm})`);glow.addColorStop(1,"transparent");
    g.fillStyle=glow;g.fillRect(145,35,360,225);
    // The shadow and visible right wall make the timber cabin read in depth.
    face(g,[[224,148],[386,148],[432,126],[432,201],[386,224],[224,224]],"#5c4635","#=: ",12,1);
    face(g,[[386,148],[432,126],[432,201],[386,224]],"#95704d","%:",11,.94);
    face(g,[[224,148],[386,148],[386,224],[224,224]],"#d3a872","#=:",11,1);
    face(g,[[207,150],[303,80],[391,151]],"#d8a874","%@#",11,1);
    face(g,[[303,80],[395,94],[440,137],[391,151]],"#ad8565","#%:",11,1);
    face(g,[[357,97],[371,97],[371,73],[383,73],[383,106],[357,106]],"#927259","##",9,1);
    edge(g,207,150,303,80,"/","#ffdda3");edge(g,303,80,391,151,"\\","#f3c187");
    edge(g,224,148,224,224,"|","#e8c390");edge(g,224,224,386,224,"_","#e8c390");
    edge(g,386,148,386,224,"|","#f1c58c");edge(g,391,151,440,137,"-","#b89d7a");
    // Window panes and door hold their own glow over the shaded wall.
    for(const [x,y] of [[255,171],[347,171],[410,157]]){
      g.fillStyle=`rgba(255,199,106,${.12*warm})`;g.fillRect(x-9,y-9,31,31);
      face(g,[[x,y],[x+16,y],[x+16,y+17],[x,y+17]],"#ffe0a2","@",7,1);
      glyph(g,"+",x+8,y+9,"#76583e",13,.95);
    }
    face(g,[[305,184],[329,184],[329,224],[305,224]],"#493c31","#:",7,.98);
    glyph(g,"•",326,206,p.light,9,.9);
    for(let i=0;i<5;i++){
      const rise=(t*.018+i*17)%95;
      glyph(g,i%2?"~":"°",377+Math.sin(t*.001+i)*7+i*2,75-rise,"#d9dfd0",10-i*.5,.38*(1-rise/100));
    }
  }
  function animal(g,x,y,kind,t){
    const dx=Math.sin(t*.0008+x)*5;
    glyph(g,kind==="hen"?"(o)>":"( o o )",x+dx,y,kind==="hen"?"#e1ba78":"#d6d4bd",11,.95);
    glyph(g,kind==="hen"?"/|\\":"/|  |\\",x+dx,y+12,"#b8b49c",10,.9);
  }
  function draw(canvas,kind="farm",time=0){
    const p=themes[kind]||themes.farm;
    const dpr=Math.min(2,devicePixelRatio||1),w=canvas.clientWidth||650,h=canvas.clientHeight||205;
    const px=Math.round(w*dpr),py=Math.round(h*dpr);
    if(canvas.width!==px||canvas.height!==py){canvas.width=px;canvas.height=py;}
    const g=canvas.getContext("2d");g.setTransform(px/820,0,0,py/260,0,0);
    const sky=g.createLinearGradient(0,0,0,170);sky.addColorStop(0,p.sky[0]);sky.addColorStop(1,p.sky[1]);g.fillStyle=sky;g.fillRect(0,0,820,260);
    const lightX=kind==="stars"?674:500,lightY=kind==="stars"?49:47;
    const glow=g.createRadialGradient(lightX,lightY,2,lightX,lightY,210);
    glow.addColorStop(0,kind==="stars"?"rgba(170,205,255,.27)":"rgba(255,220,149,.46)");glow.addColorStop(1,"transparent");g.fillStyle=glow;g.fillRect(0,0,820,260);
    glyph(g,kind==="stars"?"◯":"☼",lightX,lightY,p.light,26,.9);
    if(kind==="stars")for(let i=0;i<36;i++)glyph(g,i%5?"·":"✦",(i*197)%817,13+(i*83)%92,p.light,7,.34+(i%4)*.12);
    else for(const [x,y] of [[96,44],[130,48],[513,67],[535,63]])glyph(g,"~",x+Math.sin(time*.0003)*2,y,"#e4e2c6",11,.5);
    face(g,[[0,155],[100,102],[190,149],[277,90],[397,146],[518,106],[655,152],[820,112],[820,192],[0,192]],p.hill,"::·",12,.45);
    face(g,[[0,181],[128,145],[273,183],[410,139],[567,177],[727,145],[820,168],[820,218],[0,218]],p.tree,"#:·",10,.45);
    const ground=g.createLinearGradient(0,166,0,260);ground.addColorStop(0,p.ground[0]);ground.addColorStop(1,p.ground[1]);g.fillStyle=ground;g.fillRect(0,179,820,81);
    // Receding rows give the ground a vanishing point and depth.
    for(let row=0;row<7;row++){
      const depth=row/6,y=187+depth*depth*74,spread=82+depth*570,step=18+depth*16;
      for(let x=410-spread;x<410+spread;x+=step){
        const wave=Math.sin(x*.14+time*.001+row)*2;
        glyph(g,kind==="shore"?(row%2?"~":"≈"):(row%2?"/":"'"),x,y+wave,
          kind==="shore"?"#9bc1b5":"#aac075",7+depth*5,.28+depth*.4);
      }
    }
    if(kind==="shore"){
      face(g,[[0,177],[820,171],[820,260],[0,260]],"#5590a2","~:·",11,.5);
    }else{
      for(const [x,y,s] of [[50,195,75],[121,181,61],[485,180,62],[750,196,86]])tree(g,x,y,s,p,time);
      if(kind==="forest")for(const [x,y,s] of [[75,255,166],[234,224,119],[574,231,132],[758,254,176]])tree(g,x,y,s,p,time);
      if(kind==="farm"||kind==="dawn"){
        g.save();g.translate(-90,-45);g.scale(1.25,1.2);cabin(g,time,p);g.restore();
        animal(g,522,226,"hen",time);animal(g,686,228,"sheep",time);
      }else if(kind==="stars"){
        face(g,[[315,210],[349,168],[385,210]],"#a89578","/\\",7,.9);
        for(let i=0;i<4;i++)glyph(g,i%2?"*":"^",445+Math.sin(time*.002+i)*4,226-i*9,"#ffc779",9,.8-i*.13);
      }
    }
    const shade=g.createLinearGradient(0,0,820,0);shade.addColorStop(0,"rgba(5,12,10,.28)");shade.addColorStop(.45,"transparent");shade.addColorStop(1,"rgba(5,12,10,.32)");g.fillStyle=shade;g.fillRect(0,0,820,260);
  }
  return {draw,ids:Object.keys(themes)};
})();
