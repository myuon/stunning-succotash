#version 300 es

in vec3 position;
in vec2 a_texcoord;

out vec2 v_texcoord;

void main() {
    gl_Position = vec4(position, 1.0);
    v_texcoord = a_texcoord;
}
