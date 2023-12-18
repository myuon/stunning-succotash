#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform float spp_inv;

in vec2 v_texcoord;
out vec4 outColor;

void main(){
    vec3 color = texture(u_texture, v_texcoord).xyz * spp_inv;
    outColor = vec4(color, 1.0);
}
