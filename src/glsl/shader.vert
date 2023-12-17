#version 300 es

layout (location = 0) in vec3 position;
layout (location = 1) in vec2 vtexCoord;
out vec2 texCoord;

void main(void){
    texCoord = vtexCoord;
    gl_Position = vec4(position, 1.0);
}
