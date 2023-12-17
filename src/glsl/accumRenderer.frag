#version 300 es
precision highp float;

uniform float sppInv;
uniform sampler2D accumTexture;

in vec2 texCoord;
out vec4 fragColor;

void main(){
    vec3 color = texture(accumTexture, texCoord).xyz * sppInv;
    fragColor = vec4(0.1, 0.1, 0.5, 1.0) + vec4(color, 1.0);
}
