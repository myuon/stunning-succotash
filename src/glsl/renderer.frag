#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform int iterations;

in vec2 v_texcoord;
out vec4 outColor;

void main(){
    vec3 color = texture(u_texture, v_texcoord).xyz / float(iterations);
    // gamma correction
    outColor = vec4(pow(clamp(color, 0.0, 1.0), vec3(0.4545)), 1.0);
}
