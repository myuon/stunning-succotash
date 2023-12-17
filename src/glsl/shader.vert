#version 300 es

in vec3 position;
in vec4 color;
uniform mat4 mvpMatrix;
out vec4 vColor;

void main(void){
    vColor = color;
    gl_Position = mvpMatrix * vec4(position, 1.0);
}
