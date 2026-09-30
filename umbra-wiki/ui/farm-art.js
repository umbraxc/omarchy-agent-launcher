// Colored glyph art shared by the Farming catalog and its larger live stage.
// Each crop has its own shape/palette; animals use species silhouettes.
"use strict";
(() => {
  const W = 17, H = 13;
  const green = "#75ab58", darkGreen = "#355d3d", leafLight = "#a7d47a";
  const crops = {
    wheat:["grain","#d9ae61","#846536"], rice:["rice","#e4cc85","#7e9856"], maize:["cob","#f0c951","#a66d2e"],
    barley:["grain","#c8a263","#796341"], sorghum:["plume","#b9664d","#734447"], millet:["plume","#d5ba73","#856e45"],
    quinoa:["plume","#be7994","#805472"], potato:["tuber","#b89466","#785b45"], "sweet-potato":["longroot","#cb8656","#824d43"],
    cassava:["longroot","#c7ae83","#75674b"], carrot:["carrot","#ee9441","#ac5429"], beet:["roundroot","#a94e6d","#582f53"],
    turnip:["roundroot","#e3d8af","#917a81"], radish:["roundroot","#db5968","#8e3c51"], onion:["bulb","#d5ad71","#8e6f45"],
    garlic:["bulb","#ded8bd","#928973"], "dry-bean":["pod","#9caf68","#607648"], lentil:["pod","#bca56c","#756246"],
    chickpea:["pod","#d5bd7e","#836e4e"], soybean:["pod","#9bb86b","#52744d"], pea:["pod","#88bd67","#457c49"],
    peanut:["tuber","#d1aa65","#806244"], sunflower:["flower","#f0bf48","#78553a"], tomato:["round","#dd594c","#8c3c3a"],
    pepper:["pepper","#d84f43","#883736"], cucumber:["long","#6bb55a","#326c45"], pumpkin:["pumpkin","#e69240","#974f2c"],
    zucchini:["long","#7cae58","#47633a"], eggplant:["long","#9a659f","#513c76"], cabbage:["leafhead","#90b470","#4c7050"],
    broccoli:["broccoli","#669662","#3a6549"], cauliflower:["broccoli","#e5dcc0","#a5a180"], kale:["leaf","#62945d","#315a42"],
    spinach:["leaf","#7aad6a","#426b4d"], lettuce:["leafhead","#a5c87b","#6f935b"], chard:["leaf","#7ca466","#9d4f55"],
    strawberry:["berry","#d75f61","#8c3f4c"],
  };
  const animals = {
    "hen-eggs":["bird","#d5ae77","#865d43"], "duck-eggs":["duck","#c8c9a0","#777e65"], broiler:["bird","#e1d7bd","#9c8d70"],
    turkey:["turkey","#a87d64","#614d46"], rabbit:["rabbit","#b7a48d","#746c61"], "goat-milk":["goat","#d8c9a8","#877966"],
    "goat-meat":["goat","#b99372","#6e594d"], "sheep-meat":["sheep","#d8d4b9","#898773"], pig:["pig","#de9a9a","#9f666e"],
    "cow-milk":["cow","#e5dfcc","#5c5b56"], beef:["cow","#9b725c","#594840"], quail:["bird","#b49b77","#74654d"],
    goose:["goose","#dfd9bd","#8d8f7c"], "fish-carp":["fish","#c7a16c","#777355"], "fish-tilapia":["fish","#88a5a2","#4d737b"],
    buffalo:["buffalo","#726b60","#3e403d"],
  };
  const mix = (a,b,t) => {
    const x = a.match(/\w\w/g).map((v)=>parseInt(v,16)), y = b.match(/\w\w/g).map((v)=>parseInt(v,16));
    return `rgb(${x.map((v,i)=>Math.round(v*(1-t)+y[i]*t)).join(",")})`;
  };
  function sprite(item, tick=0) {
    const animal = !!item.product;
    const [shape, main, shadow] = (animal ? animals : crops)[item.id] || ["leaf",green,darkGreen];
    const glow = mix(main,"#ffffff",.32), leaf = shape === "cob" ? "#6ba157" : green;
    const cells = Array.from({length:H},()=>Array(W).fill(null));
    const dot=(x,y,c=main,g="@")=>{ x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H)cells[y][x]=[g,c]; };
    const line=(x1,y1,x2,y2,c=leaf,g="/")=>{const steps=Math.max(Math.abs(x2-x1),Math.abs(y2-y1));for(let k=0;k<=steps;k++)dot(x1+(x2-x1)*k/steps,y1+(y2-y1)*k/steps,c,g);};
    const oval=(cx,cy,rx,ry,c=main,s=shadow)=>{for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const d=((x-cx)/rx)**2+((y-cy)/ry)**2;if(d>1)continue;
      dot(x,y,x<cx-1?s:y<cy-1?glow:c,d>.77?"o":x<cx-1?"#":"@");
    }};
    const leaves=(top=4)=>{line(8,top,8,10,darkGreen,"|");line(8,top+2,4,top,leaf,"/");line(8,top+2,12,top,leaf,"\\");dot(3,top,leafLight,"*");dot(13,top,leafLight,"*");};
    if (!animal) {
      if (["grain","rice","plume"].includes(shape)) {
        line(8,11,8,2,green,"|");line(8,8,4,5,green,"/");line(8,9,12,5,green,"\\");
        for(let y=2;y<7;y++)for(const side of [-1,1]){let x=8+side*(shape==="rice"?(y-1):2+(y%2));dot(x,y, y<4?glow:main,shape==="plume"?"*":"@");}
        if(shape==="rice")line(8,2,12,4,main,".");
      } else if(shape==="cob") { leaves(3);oval(8,7,2.4,4,main,shadow);for(let y=4;y<10;y++)dot(8,y,glow,"o"); }
      else if(shape==="flower") { leaves(7);for(let a=0;a<10;a++){let v=a*2*Math.PI/10;dot(8+4*Math.cos(v),4+3*Math.sin(v),main,"*");}oval(8,4,2,2,shadow,shadow);dot(7,3,glow,"o"); }
      else if(shape==="carrot") { leaves(2);for(let y=5;y<=11;y++)for(let x=8-Math.max(0,4-Math.floor(y/2));x<=8+Math.max(0,4-Math.floor(y/2));x++)dot(x,y,x<8?shadow:y<7?glow:main,y>9?"/":"@"); }
      else if(["tuber","roundroot","longroot","bulb"].includes(shape)) {
        line(8,2,8,6,green,"|");line(8,4,5,2,leaf,"/");line(8,4,11,2,leaf,"\\");
        const rx=shape==="longroot"?3.1:shape==="bulb"?3.1:4.2,ry=shape==="longroot"?4.1:3.1;
        oval(8,8,rx,ry);if(shape==="tuber")for(const [x,y] of [[6,7],[9,9],[10,7]])dot(x,y,shadow,".");
        if(shape==="bulb")line(8,10,8,12,shadow,"|");
      } else if(["long","pepper"].includes(shape)) {
        const horizontal=shape==="long";
        oval(8,7,horizontal?6:3.4,horizontal?2.3:4,main,shadow);
        line(horizontal?2:8,horizontal?7:3,horizontal?0:10,horizontal?5:1,green,"/");
        if(item.id==="cucumber")for(const [x,y] of [[5,6],[8,8],[11,6]])dot(x,y,glow,".");
        if(item.id==="eggplant"){dot(4,5,green,"*");dot(5,4,green,"*");}
      } else if(shape==="pod") {
        leaves(2);line(5,5,12,8,green,"\\");oval(6,7,2.4,1.5);oval(11,9,2.5,1.4);
        dot(6,7,glow,"o");dot(11,9,glow,"o");
      } else if(["leaf","leafhead","broccoli"].includes(shape)) {
        leaves(3);if(shape==="leaf"){
          for(const [x,y,r] of [[5,6,2],[9,5,3],[12,7,2]])oval(x,y,r,3,main,shadow);
        } else if(shape==="broccoli"){
          line(8,8,8,12,green,"|");for(const [x,y] of [[5,6],[8,4],[11,6]])oval(x,y,2.5,2,main,shadow);
        } else oval(8,7,5,4,main,shadow);
      } else if(shape==="berry") {
        leaves(2);for(const [x,y] of [[5,7],[10,6],[8,9]]){oval(x,y,2,2.2);dot(x-1,y-1,glow,".");}
      } else {
        oval(8,7,shape==="pumpkin"?6:4.2,shape==="pumpkin"?3.7:3.5);
        line(8,2,8,4,green,"|");line(8,4,5,3,leaf,"/");line(8,4,11,3,leaf,"\\");
        if(shape==="pumpkin")for(const x of [5,8,11])line(x,5,x,9,shadow,"|");
      }
      const sway=Math.round(Math.sin(tick*.65));
      if(sway)for(let y=0;y<4;y++){
        const row=Array(W).fill(null);
        for(let x=0;x<W;x++)if(cells[y][x]&&x+sway>=0&&x+sway<W)row[x+sway]=cells[y][x];
        cells[y]=row;
      }
      if(tick%6===2)dot(shape==="long"?10:9,7,glow,".");
    } else if(shape==="fish"){
      oval(9,7,5.3,2.8);for(let y=5;y<10;y++)line(3,7,0,y+(tick%2?1:-1),shadow,"<");
      line(8,5,10,2,main,"/");dot(12,6,"#14191a","o");
    } else if(["bird","duck","turkey","goose"].includes(shape)){
      oval(7,8,4.5,2.7);oval(shape==="goose"?12:11,shape==="goose"?4:5,1.8,1.8);
      if(shape==="goose"||shape==="duck")line(11,5,11,8,main,"|");
      line(3,8,1,5,shadow,"/");line(6,10,6,12,shadow,"|");line(9,10,9,12,shadow,"|");
      dot(13,5,"#e0a553",">");dot(11,4,"#1d2121","o");
      if(shape==="turkey")for(let y=3;y<8;y++)dot(2,y,main,"*");
      if(tick%6===5)dot(11,4,shadow,"-");
    } else {
      oval(7,8,5.2,2.8);oval(13,6,2.1,2.2);
      for(const x of [4,10])line(x,10,x,tick%4===2&&x===10?11:12,shadow,"|");
      line(2,7,0,6,shadow,"~");dot(14,5,"#19201e",tick%6===5?"-":"o");
      if(["cow","goat","buffalo"].includes(shape)){
        line(12,4,11,2,shadow,"/");line(14,4,15,2,shadow,"\\");
        if(shape==="cow"&&item.id==="cow-milk")for(const [x,y] of [[5,7],[9,9]])dot(x,y,shadow,"#");
      }
      if(shape==="pig")oval(15,7,1.2,1,glow,main);
      if(shape==="sheep")for(const [x,y] of [[3,7],[5,6],[8,6],[10,7]])dot(x,y,glow,"@");
      if(shape==="rabbit"){
        line(12,4,12,0,main,"|");line(14,4,15,0,main,"|");
        dot(2,8,glow,"*");
      }
    }
    return {cells,main,shadow,animal};
  }
  const setup=(canvas)=>{
    const dpr=Math.min(2,window.devicePixelRatio||1),w=canvas.clientWidth||canvas.width||64,h=canvas.clientHeight||canvas.height||64;
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    const g=canvas.getContext("2d");g.setTransform(dpr,0,0,dpr,0,0);return {g,w,h};
  };
  function glyphs(g,cells,x,y,step) {
    g.font=`700 ${step*1.05}px ${getComputedStyle(document.documentElement).getPropertyValue("--font")||"monospace"}`;
    g.textAlign="center";g.textBaseline="middle";
    for(let row=0;row<H;row++)for(let col=0;col<W;col++){
      const cell=cells[row][col];if(!cell)continue;g.fillStyle=cell[1];g.fillText(cell[0],x+(col+.5)*step,y+(row+.5)*step);
    }
  }
  function mini(canvas,item) {
    if(!item)return;const {g,w,h}=setup(canvas),s=sprite(item),step=Math.min((w-5)/W,(h-7)/H);
    g.fillStyle="#101711";g.fillRect(0,0,w,h);
    const halo=g.createRadialGradient(w*.5,h*.48,1,w*.5,h*.48,w*.5);halo.addColorStop(0,mix(s.main,"#151b16",.78));halo.addColorStop(1,"#101711");
    g.fillStyle=halo;g.fillRect(0,0,w,h);glyphs(g,s.cells,(w-W*step)/2,(h-H*step)/2,step);
  }
  function scene(g,w,h,t) {
    const sky=g.createLinearGradient(0,0,0,h);sky.addColorStop(0,"#314b55");sky.addColorStop(.5,"#738d73");sky.addColorStop(1,"#253c28");
    g.fillStyle=sky;g.fillRect(0,0,w,h);
    const sun=g.createRadialGradient(w*.72,h*.2,3,w*.72,h*.2,w*.43);sun.addColorStop(0,"rgba(255,210,123,.62)");sun.addColorStop(1,"transparent");g.fillStyle=sun;g.fillRect(0,0,w,h);
    g.fillStyle="rgba(255,223,156,.7)";g.beginPath();g.arc(w*.72,h*.2,8,0,Math.PI*2);g.fill();
    const cell=Math.min(14,Math.max(5,(w-20)/74)),dy=cell*1.18,ox=(w-74*cell)/2,base=h*.78;
    const draw=(lines,x,y,color,light)=>{g.font=`700 ${cell*1.2}px monospace`;g.textBaseline="middle";g.textAlign="left";
      lines.forEach((row,j)=>[...row].forEach((ch,i)=>{if(ch===" ")return;g.fillStyle=ch==="o"?"#ffd083":ch==="%"?"#6f563e":ch==="^"?light||"#72965d":color;
        g.fillText(ch,ox+(x+i)*cell,y+j*dy);}));};
    draw(["     .---.           .---.        .--.","   _(     )_       (     )_     (    )", "     `---'           `---'        `--'"],1,h*.17,"#c0c9ad");
    draw(["      /\\       /\\                   /\\"],7,h*.22,"#d8d9b0");
    draw(["        /\\                    /\\                    /\\", "       /##\\       /\\         /##\\        /\\        /##\\", "      /####\\     /##\\       /####\\      /##\\      /####\\", "     /######\\   /####\\     /######\\    /####\\    /######\\", "        ||         ||            ||          ||          ||"],0,base-6*dy,"#4b7456","#638c5f");
    const cabin=["            ||", "         ___||___", "        /%%%%%%%\\", "       /%%%%%%%%%\\", "      /_____________\\", "      |  o      o  |", "      |      __     |", "      |  o  |  | o  |", "      |_____|__|____|", "       /_/      \\_\\"];
    const cx=Math.max(15,Math.round(74*.32));
    const hearth=g.createRadialGradient(ox+(cx+8)*cell,base-4*dy,2,ox+(cx+8)*cell,base-4*dy,cell*19);
    hearth.addColorStop(0,`rgba(245,171,75,${.23+.04*Math.sin(t*.003)})`);hearth.addColorStop(1,"transparent");g.fillStyle=hearth;g.fillRect(0,0,w,h);
    draw(cabin,cx,base-9*dy,"#c1a77c");
    for(let i=0;i<3;i++){const drift=Math.sin(t*.0005+i)*1.5,up=(t*.012+i*3)%11;draw([i%2?"°":"~"],cx+12+drift,base-(10+up)*dy,"#8b9b91");}
    draw(["  /\\        .   .     /\\", " /##\\              /##\\", "   ||    _|_|_|_      ||"],1,base-3*dy,"#6d955f");
    const wander=Math.sin(t*.0005)*1.7;
    draw([" (o)>  "," /|\\  "],56+wander,base-2*dy,"#d2b783");
    draw([" .-~~-. ","( o  o )", " /|  |\\"],64-wander,base-3*dy,"#d5d0b3");
    g.fillStyle="rgba(28,53,31,.52)";g.fillRect(0,base+dy*.2,w,h-base);
    draw(["__._..__..____.._._..____.__.._..____.._._..____.._..____.._"],0,base,"#b1bf75");
    for(let row=1;row<5;row++)draw([row%2?"\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\\":"/////////////////////////////////////////////"],2,base+row*dy*.88,row%2?"#779b59":"#a6aa61");
  }
  function hero(canvas,item,frame=0) {
    const {g,w,h}=setup(canvas);g.clearRect(0,0,w,h);
    if(!item){scene(g,w,h,frame);return;}
    const s=sprite(item,Math.floor(frame/350));
    const bg=g.createLinearGradient(0,0,w,h);bg.addColorStop(0,"#101b1b");bg.addColorStop(1,"#182019");g.fillStyle=bg;g.fillRect(0,0,w,h);
    const halo=g.createRadialGradient(w*.5,h*.43,2,w*.5,h*.43,w*.42);halo.addColorStop(0,mix(s.main,"#182019",.68));halo.addColorStop(1,"transparent");g.fillStyle=halo;g.fillRect(0,0,w,h);
    const step=Math.min((w-20)/W,(h-25)/H,15),x=(w-W*step)/2,y=(h-H*step)/2;
    g.fillStyle="rgba(0,0,0,.32)";g.beginPath();g.ellipse(w*.5,h*.87,w*.28,11,0,0,7);g.fill();
    glyphs(g,s.cells,x,y,step);
    g.fillStyle="#6d8d68";g.font="10px monospace";g.textAlign="left";g.fillText("▸ FIELD STUDY / "+item.id.toUpperCase(),12,h-11);
  }
  window.UmbraFarmArt={mini,hero,cropIds:Object.keys(crops),animalIds:Object.keys(animals)};
})();
