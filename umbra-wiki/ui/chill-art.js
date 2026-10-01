// Occasional quiet landscapes in relaxed conversation. Scene IDs are stored in
// History; the bundled art can be replayed without asking an AI or the network.
"use strict";
(() => {
  const names = {dawn:"Sunrise over a cabin",forest:"A sunlit forest",shore:"A quiet shore",stars:"Camp under the stars",
    valley:"A river valley homestead",rain:"A rainy forest refuge"};
  const ids=Object.keys(names);
  let lastTurn=-9,lastId="";
  function select(question,turn){
    const q=question.toLowerCase();
    if(!/(fun fact|interesting fact|random fact|tell me (a |another |some )?(story|stories)|how are you|what'?s up|quiet|stillness|relax|chill|vibe|beautiful day)/.test(q))return "";
    if(turn-lastTurn<3||Math.random()>(/(fun fact|story)/.test(q)?.55:.3))return "";
    const choices=ids.filter(x=>x!==lastId);
    lastId=choices[Math.floor(Math.random()*choices.length)];lastTurn=turn;
    return lastId;
  }
  function render(after,id){
    if(!names[id])return;
    const card=document.createElement("div");card.className="chat-scene";
    card.setAttribute("role","img");card.setAttribute("aria-label",names[id]);
    card.innerHTML='<span>UMBRA // QUIET MOMENT</span><canvas aria-hidden="true"></canvas>';
    after.after(card);
    const canvas=card.querySelector("canvas"),draw=()=>window.UmbraLandscape.draw(canvas,id,performance.now());
    draw();
    let visible=false;
    const observer=new IntersectionObserver(entries=>{visible=!!entries[0]?.isIntersecting;if(visible)draw();});
    observer.observe(card);
    const resized = new ResizeObserver(() => { if (visible) draw(); });
    resized.observe(canvas);
    const timer=setInterval(()=>{
      if(!card.isConnected){clearInterval(timer);observer.disconnect();resized.disconnect();return;}
      if(visible&&!document.hidden&&!document.body.classList.contains("reduce-motion"))draw();
    },180);
  }
  window.UmbraChill={select,render,ids};
})();
