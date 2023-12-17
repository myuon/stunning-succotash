#version 300 es
precision highp float;

in vec4 vColor;

layout (location = 0) out vec4 fragColor0;
layout (location = 1) out vec4 fragColor1;

void main(void){
    fragColor0 = vColor;
    fragColor1 = vec4(vec3(1.0) - vColor.xyz, 1.0);
}
