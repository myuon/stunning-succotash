#version 300 es

layout (location = 0) in vec3 position;

out vec2 vTexCoord;

void main(void){
    gl_Position = vec4(position, 1.0);
    vTexCoord = position.xy;
}
