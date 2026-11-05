import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionCreateMenu } from '../src/components/canvas/canvas-create-menus';
import { InfiniteCanvas } from '../src/components/canvas/infinite-canvas';
import { useThemeStore } from '../src/stores/use-theme-store';
import '../src/styles/globals.css';
import '../src/i18n';
let scale = 1;
const root = createRoot(document.getElementById('root')!);
(window as any).renderMenus = (k = 1, dark = false) => {
 scale = k; useThemeStore.setState({ theme: dark ? 'dark' : 'light' });
 root.render(<InfiniteCanvas containerRef={{current:null}} viewport={{x:0,y:0,k}} tool="select" onViewportChange={()=>{}}><ConnectionCreateMenu pending={{connection:{nodeId:'source',type:'output'},position:{x:60/k,y:50/k}}} scale={k} onCreate={()=>{}} onClose={()=>{}} /></InfiniteCanvas>);
};
(window as any).menuBounds = () => {
 const menu = document.querySelector<HTMLElement>('[data-connection-create-menu]')!, bounds = menu.getBoundingClientRect();
 const texts = [...menu.querySelectorAll('button span')].filter(el=>el.childElementCount===0 && el.textContent?.trim());
 const actual = texts.map(el=>{const range=document.createRange();range.selectNodeContents(el);const b=range.getBoundingClientRect();return {text:el.textContent,left:b.left,right:b.right,top:b.top,bottom:b.bottom};});
 return {scale,width:bounds.width,left:bounds.left,right:bounds.right,actual,overflow:actual.some(b=>b.left<bounds.left-0.5||b.right>bounds.right+0.5),items:menu.querySelectorAll('button').length-1};
};
(window as any).renderMenus();
