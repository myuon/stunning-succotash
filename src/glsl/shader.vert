#version 300 es

in vec3 position;
in vec2 vtexCoord;
out vec2 texCoord;

void main(void){
    texCoord = vtexCoord;
    gl_Position = vec4(position, 1.0);
}
