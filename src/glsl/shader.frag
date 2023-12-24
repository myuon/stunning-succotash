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
    float dist = 10000.0;
    Hit hit = Hit(-1, vec3(0.0), vec3(0.0));
    for(int i = 0; i < objects.length(); i++){
        Sphere obj = objects[i];
        float b = dot(ray.direction, obj.center - ray.origin);
        float c = dot(obj.center - ray.origin, obj.center - ray.origin) - obj.radius * obj.radius;
        float d = b * b - c;
        if(d > kEPS){
            float t1 = b - sqrt(d);
            if(t1 > kEPS && t1 < dist){
                dist = t1;
                hit.index = i;
                hit.point = ray.origin + ray.direction * t1;

                vec3 normal = normalize(hit.point - obj.center);
                vec3 orienting_normal = dot(normal, ray.direction) < 0.0 ? normal : -normal;

                hit.normal = orienting_normal;
                continue;
            }

            float t2 = b + sqrt(d);
            if(t2 > kEPS && t2 < dist){
                dist = t2;
                hit.index = i;
                hit.point = ray.origin + ray.direction * t2;

                vec3 normal = normalize(hit.point - obj.center);
                vec3 orienting_normal = dot(normal, ray.direction) < 0.0 ? normal : -normal;

                hit.normal = orienting_normal;
                continue;
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

vec3 raytrace(Ray ray) {
    vec3 color = vec3(0.0);
    vec3 weight = vec3(1.0);
    int count = 0;

    while (count < 150) {
        Hit hit = intersect(ray);
        if (hit.index == -1) {
            return color;
        }

        // for debug:
        // return objects[hit.index].color + objects[hit.index].emission;

        color += objects[hit.index].emission * weight;

        float russian_roulette_threshold = 0.5;
        if (count < 5) {
            russian_roulette_threshold = 1.0;
        }
        if (count > 20) {
            russian_roulette_threshold *= pow(0.5, float(count - 5));
        }

        if (rand(vec2(hit.point.x + hit.point.y, hit.point.z + max(max(weight.r, weight.g), weight.b))) >= russian_roulette_threshold) {
            return color;
        }

        ray.direction = sample_lambertian_cosine_pdf(hit.normal);
        ray.origin = hit.point + ray.direction * kEPS;
        weight *= objects[hit.index].color * 1.0 / russian_roulette_threshold;
        count++;
    }

    return vec3(1.0, 0.0, 1.0);
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
        vec2 dp = vec2(rand(vec2(gl_FragCoord.x + float(i + iterations), gl_FragCoord.y)), rand(vec2(gl_FragCoord.x, gl_FragCoord.xy + float(i + iterations))));
        vec2 p = (((gl_FragCoord.xy + dp - vec2(0.5)) * 2.0) - resolution.xy) / min(resolution.x, resolution.y);

        vec3 screen_p = screen_origin + screen_x * p.x + screen_y * p.y;
        Ray ray = Ray(camera.origin, normalize(screen_p - camera.origin));

        color += raytrace(ray);
    }

    vec4 prev = texture(u_texture, v_texcoord);

    outColor = ((float(iterations - 1) * prev) + vec4(color / float(spp), 1.0)) / float(iterations);
}
