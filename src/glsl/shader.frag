#version 300 es

precision highp float;

uniform sampler2D u_texture;
uniform int iterations;
uniform vec2 resolution;
uniform vec3 camera_position;
uniform vec3 camera_direction;
uniform vec3 camera_up;
uniform float screen_dist;
uniform int spp;

in vec2 v_texcoord;
out vec4 outColor;

const float PI = 3.14159265;
const float angle = 60.0;
const float kEPS = 1e-2;

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

struct HitRecord {
    bool hit;
    vec3 normal;
    vec3 point;
};

struct Ray {
    vec3 origin;
    vec3 direction;
};

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

struct Triangle {
    vec3 vertex;
    vec3 edge1;
    vec3 edge2;
};

float det(vec3 a, vec3 b, vec3 c) {
    return a.x * b.y * c.z + a.y * b.z * c.x + a.z * b.x * c.y
        - a.z * b.y * c.x - a.y * b.x * c.z - a.x * b.z * c.y;
}

HitRecord Triangle_intersect(Triangle self, Ray ray) {
    float d = det(self.edge1, self.edge2, -ray.direction);
    if (abs(d) < kEPS) {
        return HitRecord(false, vec3(0.0), vec3(0.0));
    }

    vec3 ov = ray.origin - self.vertex;

    float u = det(ov, self.edge2, -ray.direction) / d;
    float v = det(self.edge1, ov, -ray.direction) / d;
    float t = det(self.edge1, self.edge2, ov) / d;
    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0 || u + v > 1.0 || t < kEPS) {
        return HitRecord(false, vec3(0.0), vec3(0.0));
    }

    return HitRecord(true, normalize(cross(self.edge1, self.edge2)), ray.origin + ray.direction * t);
}

struct Rectangle {
    Triangle[2] mesh;
    vec3 emission;
    vec3 color;
    uint reflection_type;
};

Rectangle Rectangle_new(vec3[4] points, vec3 emission, vec3 color, uint reflection_type) {
    Triangle[2] mesh = Triangle[](
        Triangle(points[0], points[1] - points[0], points[2] - points[0]),
        Triangle(points[0], points[3] - points[0], points[2] - points[0])
    );

    return Rectangle(mesh, emission, color, reflection_type);
}

HitRecord Rectangle_intersect(Rectangle self, Ray ray) {
    for (int i = 0; i < self.mesh.length(); i++) {
        HitRecord hit = Triangle_intersect(self.mesh[i], ray);
        if (hit.hit) {
            return hit;
        }
    }

    return HitRecord(false, vec3(0.0), vec3(0.0));
}

// SCENE
const int MAX_N_SPHERES = 100;
uniform int n_spheres;

layout(std140) uniform Spheres {
    Sphere spheres[MAX_N_SPHERES];
};

const int MAX_N_RECTANGLES = 100;
uniform int n_rectangles;

layout(std140) uniform Rectangles {
    Rectangle rectangles[MAX_N_RECTANGLES];
};

const uint TSphere = 0u;
const uint TRectangle = 1u;

struct HitInScene {
    int index;
    uint type;
    HitRecord r;
};

HitInScene intersect(Ray ray){
    float dist = 1000000.0;
    HitInScene hit = HitInScene(-1, TSphere, HitRecord(false, vec3(0.0), vec3(0.0)));
    for(int i = 0; i < n_spheres; i++){
        Sphere obj = spheres[i];
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
            hit.type = TSphere;
            hit.r.hit = true;
            hit.r.point = ray.origin + ray.direction * t1;
            hit.r.normal = normalize(hit.r.point - obj.center);
            continue;
        }

        if(t2 > kEPS && t2 < dist){
            dist = t2;
            hit.index = i;
            hit.type = TSphere;
            hit.r.hit = true;
            hit.r.point = ray.origin + ray.direction * t2;
            hit.r.normal = normalize(hit.r.point - obj.center);

            continue;
        }
    }
    for(int i = 0; i < n_rectangles; i++){
        Rectangle obj = rectangles[i];
        HitRecord r = Rectangle_intersect(obj, ray);

        if (r.hit) {
            float t = length(r.point - ray.origin);
            if (t < dist) {
                dist = t;
                hit.index = i;
                hit.type = TRectangle;
                hit.r = r;

                continue;
            }
        }
    }

    return hit;
}

vec3 raytrace(Ray ray) {
    vec3 color = vec3(0.0);
    vec3 weight = vec3(1.0);
    int count = 0;

    while (true) {
        HitInScene hit = intersect(ray);
        if (hit.index == -1) {
            return color;
        }

        // for debugging:
        // if (hit.index != -1) {
        //     if (hit.type == TSphere) {
        //         return spheres[hit.index].color;
        //     } else if (hit.type == TRectangle) {
        //         return rectangles[hit.index].color;
        //     }
        // }

        vec3 orienting_normal = dot(hit.r.normal, ray.direction) < 0.0 ? hit.r.normal : -hit.r.normal;
        // for debugging normal:
        // return orienting_normal;

        // for debugging color:
        // return spheres[hit.index].color + spheres[hit.index].emission;

        // if (count == 1) {
        //     // return hit.normal;
        //     // return spheres[hit.index].emission;
        // }

        if (hit.type == TSphere) {
            color += spheres[hit.index].emission * weight;
        } else if (hit.type == TRectangle) {
            color += rectangles[hit.index].emission * weight;
        }

        float russian_roulette_threshold = 0.5;
        if (count < 5) {
            russian_roulette_threshold = 1.0;
        }
        if (count > 20) {
            russian_roulette_threshold *= pow(0.5, float(count - 5));
        }

        float seed = float(iterations) + float(count) + rand(hit.r.point.xy);
        float r = rand(vec2(seed, 0.0));
        if (r >= russian_roulette_threshold) {
            return color;
        }

        ray.direction = randOnHemisphere(orienting_normal, seed);
        ray.origin = hit.r.point + ray.direction * kEPS;
        if (hit.type == TSphere) {
            weight *= spheres[hit.index].color * 1.0 / russian_roulette_threshold;
        } else if (hit.type == TRectangle) {
            weight *= rectangles[hit.index].color * 1.0 / russian_roulette_threshold;
        }
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

    vec3 color = vec3(0.0);
    for (int i = 0; i < spp; i++) {
        vec2 dp = rand3(vec3(gl_FragCoord.xy + vec2(float(iterations)), float(i))).xy;
        vec2 p = (((gl_FragCoord.xy + dp - vec2(0.5)) * 2.0) - resolution.xy) / min(resolution.x, resolution.y);

        vec3 screen_p = screen_origin + screen_x * p.x + screen_y * p.y;
        Ray ray = Ray(camera.origin, normalize(screen_p - camera.origin));

        color += raytrace(ray);
    }

    vec4 prev = texture(u_texture, v_texcoord);
    vec4 current = vec4(color / float(spp), 1.0);

    outColor = prev + current;
}
