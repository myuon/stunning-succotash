#version 300 es
precision highp float;

// uniform sampler2D accumTexture;

out vec3 fragColor;

void main(void){
    // fragColor = texture(accumTexture, gl_FragCoord.xy).xyz * 0.0 + vec3(gl_FragCoord.x, gl_FragCoord.y, 0.1);
    fragColor = vec3(gl_FragCoord.x, gl_FragCoord.y, 0.1);
}
