#version 300 es

precision highp float;

uniform sampler2D u_texture;
uniform int iterations;
uniform vec2 resolution;

in vec2 v_texcoord;
out vec4 outColor;

const float PI = 3.14159265;
const float angle = 60.0;
const float fov = angle * 0.5 * PI / 180.0;
const float kEPS = 0.0001;

float rand(vec2 p){
    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
}

vec3 randOnHemisphere(vec3 n){
    vec3 u = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
    vec3 v = normalize(cross(u, n));
    float r1 = rand(vec2(float(n.x), 0.0));
    float r2 = rand(vec2(float(n.y), 0.0));
    float r = sqrt(r1);
    float theta = 2.0 * PI * r2;
    float x = r * cos(theta);
    float y = r * sin(theta);
    float z = sqrt(1.0 - r1);
    return u * x + v * y + n * z;
}

struct Circle {
    vec3 center;
    float radius;
    vec3 emission;
};

const Circle[] objects = Circle[](
    Circle(vec3(-0.577, 0.577, 0.577), 0.1, vec3(10.0, 0.2, 0.2)),
    Circle(vec3(0.577, 0.577, 0.577), 0.1, vec3(0.2, 0.2, 100.0)),
    Circle(vec3(0.0, 0.0, -2.0), 1.0, vec3(0.0, 0.1, 0.0)),
    Circle(vec3(0.0, 0.0, 0.0), 2.5, vec3(0.0, 0.0, 0.0))
);

struct Hit {
    int index;
    vec3 normal;
    vec3 point;
};

struct Ray {
    vec3 origin;
    vec3 direction;
};

Hit intersect(Ray ray){
    float dist = 10000.0;
    Hit hit = Hit(-1, vec3(0.0), vec3(0.0));
    for(int i = 0; i < objects.length(); i++){
        Circle obj = objects[i];
        float b = dot(ray.direction, obj.center - ray.origin);
        float c = dot(obj.center - ray.origin, obj.center - ray.origin) - obj.radius * obj.radius;
        float d = b * b - c;
        if(d > kEPS){
            float t1 = b - sqrt(d);
            if(t1 > kEPS && t1 < dist){
                dist = t1;
                hit.index = i;
                hit.point = ray.origin + ray.direction * t1;
                hit.normal = normalize(hit.point - obj.center);
            }

            float t2 = b + sqrt(d);
            if(t2 > kEPS && t2 < dist){
                dist = t2;
                hit.index = i;
                hit.point = ray.origin + ray.direction * t2;
                hit.normal = normalize(hit.point - obj.center);
            }
        }
    }

    return hit;
}

vec3 sample_lambertian_cosine_pdf(vec3 normal) {
    vec3 w = normal;
    vec3 u = normalize(cross(vec3(1.0, 0.0, 0.0), w));
    if (abs(w.x) > kEPS) {
        u = normalize(cross(vec3(0.0, 1.0, 0.0), w));
    }

    vec3 v = cross(w, u);

    float r1 = 2.0 * PI * rand(normal.xy);
    float cos_r2 = sqrt(rand(normal.yz));

    return normalize(u * cos(r1) * cos_r2 + v * sin(r1) * cos_r2 + w * sqrt(1.0 - cos_r2 * cos_r2));
}

vec3 raytrace(Ray ray, int count) {
    vec3 color = vec3(0.0);
    float alpha = 1.0;

    while (true) {
        Hit hit = intersect(ray);
        if (hit.index == -1) {
            return color;
        }

        color += vec3(objects[hit.index].emission * alpha);

        alpha *= 0.9;

        float russian_roulette_threshold = 0.5;
        if (count < 5) {
            russian_roulette_threshold = 1.0;
        }
        if (count > 20) {
            russian_roulette_threshold *= pow(0.5, float(count - 5));
        }

        if (rand(vec2(hit.point.x + hit.point.y, hit.point.z + alpha)) >= russian_roulette_threshold) {
            return color;
        }

        ray.direction = sample_lambertian_cosine_pdf(hit.normal);
        ray.origin = hit.point + ray.direction * kEPS;
        alpha *= 1.0 / russian_roulette_threshold;
    }
}

void main(void){
    vec3 cPos = vec3(0.0,  0.0,  2.0);
    vec3 cDir = vec3(0.0,  0.0, -1.0);
    vec3 cUp  = vec3(0.0,  1.0,  0.0);
    vec3 cSide = cross(cDir, cUp);
    
    int count = 0;
    int spp = 1;
    vec3 color = vec3(0.0);
    for (int i = 0; i < spp; i++) {
        vec2 dp = vec2(rand(gl_FragCoord.xy + vec2(i,iterations)), rand(gl_FragCoord.xy + vec2(iterations,i)));
        vec2 p = ((gl_FragCoord.xy + dp) * 2.0 - resolution) / min(resolution.x, resolution.y);
        Ray ray = Ray(cPos, normalize(vec3(sin(fov) * p.x, sin(fov) * p.y, -cos(fov))));

        color += raytrace(ray, count);
    }

    vec4 prev = texture(u_texture, v_texcoord);

    outColor = ((float(iterations - 1) * prev) + vec4(color / float(spp), 1.0)) / float(iterations);
}
