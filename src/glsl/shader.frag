#version 300 es
precision highp float;

uniform sampler2D accumTexture;

in vec2 texCoord;
layout (location = 0) out vec3 fragColor;
layout (location = 1) out vec3 state;

void main(void){
    vec3 color = texture(accumTexture, texCoord).xyz;
    fragColor = color + vec3(0.5, 0.0, 0.1);

    state = vec3(1.0);
}
