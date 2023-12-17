#version 300 es
precision highp float;

uniform sampler2D accumTexture;

out vec3 fragColor;

void main(void){
    // vec3 color = texture(accumTexture, gl_FragCoord.xy).xyz * 1.0;
    vec3 color = vec3(0.0);
    fragColor = color + vec3(gl_FragCoord.x, gl_FragCoord.y, 0.1);
}
