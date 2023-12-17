#version 300 es
precision highp float;

// uniform sampler2D accumTexture;

out vec4 fragColor;

void main(){
    // vec3 color = texture(accumTexture, gl_FragCoord.xy).xyz * 0.0;
    fragColor = vec4(0.1, 0.1, 0.5, 1.0);
}
