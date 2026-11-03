// Compare the actual DOM property so outside changes are repaired next frame.
export function textValue(node,value){const text=String(value);if(node.textContent!==text)node.textContent=text;}
export function styleValue(node,key,value){if(node.style[key]!==value)node.style[key]=value;}
