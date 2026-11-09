/** Neutral secondary tones follow the native component's contrast, never its accent hue. */
export function styleSecondary(hint:HTMLElement,primary:Element){
 const value=getComputedStyle(primary).color;const rgb=value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?/);
 const lightText=rgb&&Number(rgb[1])*.299+Number(rgb[2])*.587+Number(rgb[3])*.114>150;
 const color=lightText?[164,173,187]:[115,123,136];const alpha=rgb?.[4]?Math.min(1,Number(rgb[4])):1;
 hint.style.color=`rgba(${color.join(',')},${alpha})`;
}
