#version 300 es

precision highp float;

uniform sampler2D u_texture;
uniform int iterations;
uniform vec2 resolution;
uniform vec3 camera_position;
uniform vec3 camera_direction;
uniform vec3 camera_up;
uniform float screen_dist;

in vec2 v_texcoord;
out vec4 outColor;

const float PI = 3.14159265;
const float angle = 60.0;
const float fov = angle * 0.5 * PI / 180.0;
const float kEPS = 1e-5;

highp float rand(vec2 co){
    highp float a = 12.9898;
    highp float b = 78.233;
    highp float c = 43758.5453;
    highp float dt= dot(co.xy ,vec2(a,b));
    highp float sn= mod(dt,3.14);
    return fract(sin(sn) * c);
}

vec3 rand3(vec3 p){
	vec3 q = vec3(
		dot(p, vec3(127.1, 311.7, 74.7)),
		dot(p, vec3(269.5, 183.3, 246.1)),
		dot(p, vec3(113.5, 271.9, 124.6))
		);

	return fract(sin(q) * 43758.5453123);
}

vec3 randOnHemisphere(vec3 n, float seed){
    vec3 w = n;
    vec3 u = normalize(cross(vec3(1.0, 0.0, 0.0), w));
    if (abs(w.x) > kEPS) {
        u = normalize(cross(vec3(0.0, 1.0, 0.0), w));
    }

    vec3 v = cross(w, u);
    float r1 = rand(vec2(seed, 0.0) + n.xy);
    float r2 = rand(vec2(seed, 1.0) + n.yz);

    float phy = 2.0 * PI * r1;
    float cos_theta = sqrt(r2);

    return normalize(u * cos(phy) * cos_theta + v * sin(phy) * cos_theta + w * sqrt(1.0 - r2));
}

const uint Diffuse = 0u;
const uint Specular = 1u;
const uint Refractive = 2u;

struct Sphere {
    vec3 center;
    float radius;
    vec3 emission;
    vec3 color;
    uint reflection_type;
};

const Sphere[] objects = Sphere[](
    Sphere(vec3(1e5 + 1.0, 40.8, 81.6), 1e5, vec3(0.0), vec3(0.75, 0.25, 0.25), Diffuse), // left
    Sphere(vec3(-1e5 + 99.0, 40.8, 81.6), 1e5, vec3(0.0), vec3(0.25, 0.25, 0.75), Diffuse), // right
    Sphere(vec3(50.0, 40.8, 1e5), 1e5, vec3(0.0), vec3(0.75), Diffuse), // back
    Sphere(vec3(50.0, 40.8, -1e5 + 250.0), 1e5, vec3(0.0), vec3(0.0), Diffuse), // front
    Sphere(vec3(50.0, 1e5, 81.6), 1e5, vec3(0.0), vec3(0.75), Diffuse), // bottom
    Sphere(vec3(50.0, -1e5 + 81.6, 81.6), 1e5, vec3(0.0), vec3(0.75), Diffuse), // top
    Sphere(vec3(50.0, 90.0, 81.6), 15.0, vec3(36.0), vec3(0.0), Diffuse), // light
    Sphere(vec3(65.0, 20.0, 20.0), 20.0, vec3(0.0), vec3(0.25, 0.75, 0.25), Diffuse), // green
    Sphere(vec3(27.0, 16.5, 47.0), 16.5, vec3(0.0), vec3(0.99, 0.99, 0.99), Specular), // mirror
    Sphere(vec3(77.0, 16.5, 78.0), 16.5, vec3(0.0), vec3(0.99, 0.99, 0.99), Refractive) // glass
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
    float dist = 1000000.0;
    Hit hit = Hit(-1, vec3(0.0), vec3(0.0));
    for(int i = 0; i < objects.length(); i++){
        Sphere obj = objects[i];
        float b = dot(ray.direction, obj.center - ray.origin);
        float c = dot(obj.center - ray.origin, obj.center - ray.origin) - obj.radius * obj.radius;
        float d = b * b - c;
        if (d < 0.0) {
            continue;
        }

        float t1 = b - sqrt(d);
        float t2 = b + sqrt(d);
        if (t1 < kEPS && t2 < kEPS) {
            continue;
        }

        if(t1 > kEPS && t1 < dist){
            dist = t1;
            hit.index = i;
            hit.point = ray.origin + ray.direction * t1;
        hit.normal = normalize(hit.point - obj.center);
            continue;
        }

        if(t2 > kEPS && t2 < dist){
            dist = t2;
            hit.index = i;
            hit.point = ray.origin + ray.direction * t2;
        hit.normal = normalize(hit.point - obj.center);

            continue;
        }
    }

    return hit;
}

vec3 raytrace(Ray ray) {
    vec3 color = vec3(0.0);
    vec3 weight = vec3(1.0);
    int count = 0;

    while (true) {
        Hit hit = intersect(ray);
        if (hit.index == -1) {
            return color;
        }

        vec3 orienting_normal = dot(hit.normal, ray.direction) < 0.0 ? hit.normal : -hit.normal;
        // for debugging normal:
        // return orienting_normal;

        // for debugging color:
        // return objects[hit.index].color + objects[hit.index].emission;

        // if (count == 1) {
        //     // return hit.normal;
        //     // return objects[hit.index].emission;
        // }

        color += objects[hit.index].emission * weight;

        float russian_roulette_threshold = 0.5;
        if (count < 5) {
            russian_roulette_threshold = 1.0;
        }
        if (count > 20) {
            russian_roulette_threshold *= pow(0.5, float(count - 5));
        }

        float seed = float(iterations) + float(count) + rand(hit.point.xy);
        float r = rand(vec2(seed, 0.0));
        if (r >= russian_roulette_threshold) {
            return color;
        }

        ray.direction = randOnHemisphere(orienting_normal, seed);
        ray.origin = hit.point + ray.direction * kEPS;
        weight *= objects[hit.index].color * 1.0 / russian_roulette_threshold;
        count++;
    }
}

struct Camera {
    vec3 origin;
    vec3 up;
    vec3 direction;
    float screen_dist;
};

void main(void){
    Camera camera = Camera(camera_position, normalize(camera_up), normalize(camera_direction), screen_dist);
    float screen_width = 30.0;
    float screen_height = 30.0;

    vec3 screen_x = normalize(cross(camera.direction, camera.up)) * screen_width;
    vec3 screen_y = normalize(cross(screen_x, camera.direction)) * screen_height;
    vec3 screen_origin = camera.origin + camera.direction * camera.screen_dist;

    int spp = 1;
    vec3 color = vec3(0.0);
    for (int i = 0; i < spp; i++) {
        vec2 dp = rand3(vec3(gl_FragCoord.xy + vec2(float(iterations)), float(i))).xy;
        vec2 p = (((gl_FragCoord.xy + dp - vec2(0.5)) * 2.0) - resolution.xy) / min(resolution.x, resolution.y);

        vec3 screen_p = screen_origin + screen_x * p.x + screen_y * p.y;
        Ray ray = Ray(camera.origin, normalize(screen_p - camera.origin));

        color += raytrace(ray);
    }

    vec4 prev = texture(u_texture, v_texcoord);

    outColor = ((float(iterations - 1) * prev) + vec4(color / float(spp), 1.0)) / float(iterations);
}
