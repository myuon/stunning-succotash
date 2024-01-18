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
uniform int render_type;
uniform sampler2D triangles_texture;
uniform sampler2D material_texture;
uniform sampler2D bvh_tree_texture;
uniform int n_spheres;
uniform int sphere_texture_cursor;

const int RenderTypeRender = 0;
const int RenderTypeColor = 1;
const int RenderTypeNormal = 2;
const int RenderTypeEmission = 3;

in vec2 v_texcoord;
out vec4 outColor;

const float PI = 3.14159265;
const float kEPS = 1e-6;

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

struct Triangle {
    vec3 vertex;
    vec3 edge1;
    vec3 edge2;
    vec3 normal0;
    vec3 normal1;
    vec3 normal2;
    int material_id;
    bool smooth_normal;
};

float det(vec3 a, vec3 b, vec3 c) {
    return a.x * b.y * c.z + a.y * b.z * c.x + a.z * b.x * c.y
        - a.z * b.y * c.x - a.y * b.x * c.z - a.x * b.z * c.y;
}

vec3 Triangle_get_normal(Triangle self, float u, float v) {
    if (self.smooth_normal) {
        vec3 normal = normalize(self.normal0 * (1.0 - u - v) + self.normal1 * u + self.normal2 * v);

        return normal;
    }

    return normalize(cross(self.edge1, self.edge2));
}

bool Triangle_intersect(Triangle self, Ray ray, inout HitRecord hit) {
    float d = det(self.edge1, self.edge2, -ray.direction);
    if (abs(d) < kEPS) {
        return false;
    }

    vec3 ov = ray.origin - self.vertex;

    float u = det(ov, self.edge2, -ray.direction) / d;
    float v = det(self.edge1, ov, -ray.direction) / d;
    float t = det(self.edge1, self.edge2, ov) / d;
    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0 || u + v > 1.0 || t < kEPS) {
        return false;
    }

    hit.normal = Triangle_get_normal(self, u, v);
    hit.point = self.vertex + self.edge1 * u + self.edge2 * v;

    return true;
}

vec2 getNormalizedXYCoord(int index, int textureSize) {
    int x = index % textureSize;
    int y = index / textureSize;

    return vec2(float(x) / float(textureSize), float(y) / float(textureSize));
}

uniform int n_triangles;
uniform int n_materials;

const int textureSize = 1024;
Triangle fetchTriangle(int index) {
    int size = 24 / 4;

    vec3 vertex = texture(triangles_texture, getNormalizedXYCoord(index * size, textureSize)).xyz;
    float material_id = texture(triangles_texture, getNormalizedXYCoord(index * size, textureSize)).w;
    vec3 edge1 = texture(triangles_texture, getNormalizedXYCoord(index * size + 1, textureSize)).xyz;
    vec3 edge2 = texture(triangles_texture, getNormalizedXYCoord(index * size + 2, textureSize)).xyz;
    float smooth_normal = texture(triangles_texture, getNormalizedXYCoord(index * size + 2, textureSize)).w;
    vec3 normal0 = texture(triangles_texture, getNormalizedXYCoord(index * size + 3, textureSize)).xyz;
    vec3 normal1 = texture(triangles_texture, getNormalizedXYCoord(index * size + 4, textureSize)).xyz;
    vec3 normal2 = texture(triangles_texture, getNormalizedXYCoord(index * size + 5, textureSize)).xyz;

    return Triangle(vertex, edge1, edge2, normal0, normal1, normal2, int(material_id), smooth_normal > 0.0);
}

struct Sphere {
    vec3 center;
    float radius;
    int material_id;
};

Sphere fetchSphere(int index) {
    int size = 8 / 4;

    vec3 center = texture(triangles_texture, getNormalizedXYCoord(sphere_texture_cursor + index * size, textureSize)).xyz;
    float radius = texture(triangles_texture, getNormalizedXYCoord(sphere_texture_cursor + index * size, textureSize)).w;
    float material_id = texture(triangles_texture, getNormalizedXYCoord(sphere_texture_cursor + index * size + 1, textureSize)).x;

    return Sphere(center, radius, int(material_id));
}

bool Sphere_intersect(Sphere self, Ray ray, inout HitRecord hit) {
    vec3 oc = ray.origin - self.center;
    float a = dot(ray.direction, ray.direction);
    float b = 2.0 * dot(oc, ray.direction);
    float c = dot(oc, oc) - self.radius * self.radius;
    float d = b * b - 4.0 * a * c;

    if (d < 0.0) {
        return false;
    }

    float t = (-b - sqrt(d)) / (2.0 * a);
    if (t < kEPS) {
        t = (-b + sqrt(d)) / (2.0 * a);
    }
    if (t < kEPS) {
        return false;
    }

    hit.normal = normalize(ray.origin + ray.direction * t - self.center);
    hit.point = ray.origin + ray.direction * t;

    return true;
}

struct AABB {
    vec3 minv;
    vec3 maxv;
};

bool AABB_intersect(AABB self, Ray ray) {
    float tmin = (self.minv.x - ray.origin.x) / ray.direction.x;
    float tmax = (self.maxv.x - ray.origin.x) / ray.direction.x;

    if (tmin > tmax) {
        float tmp = tmin;
        tmin = tmax;
        tmax = tmp;
    }

    float tymin = (self.minv.y - ray.origin.y) / ray.direction.y;
    float tymax = (self.maxv.y - ray.origin.y) / ray.direction.y;

    if (tymin > tymax) {
        float tmp = tymin;
        tymin = tymax;
        tymax = tmp;
    }

    if ((tmin > tymax) || (tymin > tmax)) {
        return false;
    }

    if (tymin > tmin) {
        tmin = tymin;
    }

    if (tymax < tmax) {
        tmax = tymax;
    }

    float tzmin = (self.minv.z - ray.origin.z) / ray.direction.z;
    float tzmax = (self.maxv.z - ray.origin.z) / ray.direction.z;

    if (tzmin > tzmax) {
        float tmp = tzmin;
        tzmin = tzmax;
        tzmax = tmp;
    }

    if ((tmin > tzmax) || (tzmin > tmax)) {
        return false;
    }

    return true;
}

struct Material {
    int id;
    vec3 color;
    vec3 emission;
    vec3 specular;
    float specular_weight;
    AABB aabb;
    int t_index_min;
    int t_index_max;
    uint shape;
};

Material fetchMaterial(int index) {
    int size = 20 / 4;
    int x = (index * size) % textureSize;
    int y = (index * size) / textureSize;

    vec3 color = texture(material_texture, getNormalizedXYCoord(index * size, textureSize)).xyz;
    uint shape = uint(texture(material_texture, getNormalizedXYCoord(index * size, textureSize)).w);
    vec3 emission = texture(material_texture, getNormalizedXYCoord(index * size + 1, textureSize)).xyz;
    vec3 specular = texture(material_texture, getNormalizedXYCoord(index * size + 2, textureSize)).xyz;
    float specular_weight = texture(material_texture, getNormalizedXYCoord(index * size + 2, textureSize)).w;
    vec3 minv = texture(material_texture, getNormalizedXYCoord(index * size + 3, textureSize)).xyz;
    int t_index = int(texture(material_texture, getNormalizedXYCoord(index * size + 3, textureSize)).w);
    vec3 maxv = texture(material_texture, getNormalizedXYCoord(index * size + 4, textureSize)).xyz;
    int t_length = int(texture(material_texture, getNormalizedXYCoord(index * size + 4, textureSize)).w);

    return Material(index, color, emission, specular, specular_weight, AABB(minv, maxv), t_index, t_index + t_length, shape);
}

struct BVHTreeNode {
    uint bvh_tree_node_type;
    AABB aabb;
    int left;
    int right;
    int n_triangles;
    int t_index;
};

const uint BVHTreeNodeTypeNode = 0u;
const uint BVHTreeNodeTypeLeaf = 1u;

bool fetchBVHTreeNode(int index, inout BVHTreeNode node) {
    int cursor = int(texture(bvh_tree_texture, getNormalizedXYCoord(index, textureSize)).x);
    if (cursor == 0) {
        return false;
    }

    vec3 minv = texture(bvh_tree_texture, getNormalizedXYCoord(cursor, textureSize)).xyz;
    uint bvh_tree_node_type = uint(texture(bvh_tree_texture, getNormalizedXYCoord(cursor, textureSize)).w);
    vec3 maxv = texture(bvh_tree_texture, getNormalizedXYCoord(cursor + 1, textureSize)).xyz;
    int n_triangles = int(texture(bvh_tree_texture, getNormalizedXYCoord(cursor + 1, textureSize)).w);

    node = BVHTreeNode(
        bvh_tree_node_type,
        AABB(minv, maxv),
        index * 2 + 1,
        index * 2 + 2,
        n_triangles,
        cursor
    );

    return true;
}

int fetchBVHTreeLeafTriangleIndex(int cursor) {
    return int(texture(bvh_tree_texture, getNormalizedXYCoord(cursor, textureSize)).x);
}

const uint TTriangle = 0u;
const uint TSphere = 1u;

struct HitInScene {
    int index;
    uint type;
    HitRecord r;
};

HitInScene intersect(Ray ray){
    float dist = 1000000.0;
    HitInScene hit = HitInScene(-1, TTriangle, HitRecord(false, vec3(0.0), vec3(0.0)));

    // use BVHTree?

    // BVHTreeNode node;
    // if (!fetchBVHTreeNode(0, node)) {
    //     return hit;
    // }

    // int node_index = 0;
    // int stop_infinite_loop = 100;
    // while (stop_infinite_loop-- > 0) {
    //     if (fetchBVHTreeNode(node_index, node)) {
    //         if (node.bvh_tree_node_type == BVHTreeNodeTypeLeaf) {
    //             for (int i = node.t_index; i < node.t_index + node.n_triangles; i++) {
    //                 int t_index = fetchBVHTreeLeafTriangleIndex(i);
    //                 Triangle obj = fetchTriangle(t_index);
    //                 HitRecord r = Triangle_intersect(obj, ray);

    //                 if (r.hit) {
    //                     float t = length(r.point - ray.origin);
    //                     if (t < dist) {
    //                         dist = t;
    //                         hit.index = t_index;
    //                         hit.type = TTriangle;
    //                         hit.r = r;

    //                         continue;
    //                     }
    //                 }
    //             }

    //             return hit;
    //         } else if (node.bvh_tree_node_type == BVHTreeNodeTypeNode) {
    //             if (!AABB_intersect(node.aabb, ray)) {
    //                 return hit;
    //             }

    //             BVHTreeNode left;
    //             fetchBVHTreeNode(node.left, left);
    //             BVHTreeNode right;
    //             fetchBVHTreeNode(node.right, right);

    //             if (AABB_intersect(left.aabb, ray)) {
    //                 node_index = node.left;
    //             } else if (AABB_intersect(right.aabb, ray)) {
    //                 node_index = node.right;
    //             } else {
    //                 hit.r.normal = vec3(1, 0, 1);
    //                 return hit;
    //             }

    //             continue;
    //         }
    //     } else {
    //         hit.r.normal = vec3(1, 0, 1);
    //         return hit;
    //     }
    // }

    for (int i = 0; i < n_materials; i++) {
        Material material = fetchMaterial(i);
        if (!AABB_intersect(material.aabb, ray)) {
            continue;
        }

        if (material.shape == TTriangle) {
            for (int j = material.t_index_min; j < material.t_index_max; j++) {
                Triangle obj = fetchTriangle(j);

                HitRecord r;
                if (Triangle_intersect(obj, ray, r)) {
                    float t = length(r.point - ray.origin);
                    if (t < dist) {
                        dist = t;
                        hit.index = j;
                        hit.type = TTriangle;
                        hit.r = r;
                    }
                }
            }
        } else if (material.shape == TSphere) {
            Sphere obj = fetchSphere(material.t_index_min);

            HitRecord r;
            if (Sphere_intersect(obj, ray, r)) {
                float t = length(r.point - ray.origin);
                if (t < dist) {
                    dist = t;
                    hit.index = material.t_index_min;
                    hit.type = TSphere;
                    hit.r = r;
                }
            }
        }
    }

    return hit;
}

void next_ray(HitInScene hit, float seed, inout Ray ray, bool is_specular) {
    vec3 object_color = vec3(1.0);
    if (hit.type == TTriangle) {
        Triangle t = fetchTriangle(hit.index);
        Material m = fetchMaterial(t.material_id);
        object_color = m.color;
    } else if (hit.type == TSphere) {
        Sphere s = fetchSphere(hit.index);
        Material m = fetchMaterial(s.material_id);
        object_color = m.color;
    } else {
        object_color = vec3(1, 0, 1);
    }

    vec3 orienting_normal = dot(hit.r.normal, ray.direction) < 0.0 ? hit.r.normal : -hit.r.normal;
    ray.origin = hit.r.point + orienting_normal * kEPS;

    if (hit.type == TTriangle) {
        Triangle t = fetchTriangle(hit.index);
        Material m = fetchMaterial(t.material_id);

        if (is_specular) {
            ray.direction = reflect(ray.direction, orienting_normal);
        } else {
            ray.direction = randOnHemisphere(orienting_normal, seed);
        }
    } else if (hit.type == TSphere) {
        Sphere s = fetchSphere(hit.index);
        Material m = fetchMaterial(s.material_id);

        if (is_specular) {
            ray.direction = reflect(ray.direction, orienting_normal);
        } else {
            ray.direction = randOnHemisphere(orienting_normal, seed);
        }
    } else {
        ray.direction = reflect(ray.direction, orienting_normal);
    }
}

struct HitOnLight {
    vec3 point;
    vec3 normal;
    float area_prob;
    int index;
    vec3 emission;
};

Material get_random_light(float seed) {
    int lights = 0;
    for (int i = 0; i < n_materials; i++) {
        Material material = fetchMaterial(i);
        if (material.emission.x > 0.0 || material.emission.y > 0.0 || material.emission.z > 0.0) {
            lights++;
        }
    }

    int m = int(rand(vec2(seed, 0.0)) * float(lights));
    int m_index = 0;
    Material material;
    for (int i = 0; i < n_materials; i++) {
        Material material = fetchMaterial(i);
        if (material.emission.x > 0.0 || material.emission.y > 0.0 || material.emission.z > 0.0) {
            if (m_index == m) {
                return material;
            }

            m_index++;
        }
    }
}

bool sample_on_light(out HitOnLight hit, float seed) {
    Material material = get_random_light(seed);
    int t_index = int(rand(vec2(seed, 1.0)) * float(material.t_index_max - material.t_index_min)) + material.t_index_min;

    Triangle t = fetchTriangle(t_index);

    float u = rand(vec2(seed, 2.0));
    float v = rand(vec2(seed, 3.0));
    if (u + v > 1.0) {
        u = 1.0 - u;
        v = 1.0 - v;
    }

    hit.point = t.vertex + t.edge1 * u + t.edge2 * v;
    hit.normal = normalize(cross(t.edge1, t.edge2));
    hit.area_prob = 2.0 / length(cross(t.edge1, t.edge2));
    hit.index = t_index;
    hit.emission = material.emission;

    return true;
}

vec3 raytrace(Ray ray) {
    vec3 color = vec3(0.0);
    vec3 weight = vec3(1.0);
    int count = 0;

    bool is_prev_perfect_specular = true;

    while (true) {
        HitInScene hit = intersect(ray);
        if (hit.index == -1) {
            return color;
        }

        Triangle t;
        Material m;
        vec3 object_color = vec3(1.0);
        if (hit.type == TTriangle) {
            t = fetchTriangle(hit.index);
            m = fetchMaterial(t.material_id);
            object_color = m.color;
        } else if (hit.type == TSphere) {
            Sphere s = fetchSphere(hit.index);
            m = fetchMaterial(s.material_id);
            object_color = m.color;
        } else {
            object_color = vec3(1, 0, 1);
        }

        if (render_type == RenderTypeColor) {
            return object_color;
        }

        if (render_type == RenderTypeEmission) {
            return m.emission + vec3(0.1);
        }

        vec3 orienting_normal = dot(hit.r.normal, ray.direction) < 0.0 ? hit.r.normal : -hit.r.normal;

        if (render_type == RenderTypeNormal) {
            return orienting_normal + vec3(0.25);
        }

        if (is_prev_perfect_specular) {
            color += m.emission * weight;
        }

        vec3 weight_delta = object_color;
        float seed = float(iterations) + float(count) + rand(hit.r.point.xy);

        bool is_specular = false;
        if (m.specular_weight > 0.0) {
            float specular_prob = m.specular_weight / (m.specular_weight + 1.0);
            float r = rand(vec2(seed, m.specular_weight) + hit.r.point.xy);
            if (r < specular_prob) {
                is_specular = true;
                weight_delta = m.specular / specular_prob;
            } else {
                weight_delta = object_color / (1.0 - specular_prob);
            }
        }
        if (!is_specular) {
            HitOnLight hit_on_light;
            if (!sample_on_light(hit_on_light, seed)) {
                return color;
            }

            Ray shadow_ray = Ray(hit.r.point, normalize(hit_on_light.point - hit.r.point));

            HitInScene shadow_ray_hit = intersect(shadow_ray);

            if (shadow_ray_hit.index != -1 && shadow_ray_hit.index == hit_on_light.index) {
                float g = abs(dot(hit_on_light.normal, shadow_ray.direction)) * abs(dot(shadow_ray.direction, hit.r.normal)) / pow(length(hit_on_light.point - hit.r.point), 2.0);
                color += hit_on_light.emission * weight * weight_delta * object_color * g / hit_on_light.area_prob;
            }
        }

        float russian_roulette_threshold = 0.5;
        if (count < 5) {
            russian_roulette_threshold = 1.0;
        }
        if (count > 20) {
            russian_roulette_threshold *= pow(0.5, float(count - 5));
        }

        float r = rand(vec2(seed, 0.0));
        if (r >= russian_roulette_threshold) {
            return color;
        }

        next_ray(hit, seed, ray, is_specular);
        weight *= weight_delta / russian_roulette_threshold;
        count++;

        is_prev_perfect_specular = is_specular;
    }
}

struct Camera {
    vec3 origin;
    vec3 up;
    vec3 direction;
    float screen_dist;
};

float tentFilter(float x) {
	return (x < 0.5) ? sqrt(2.0 * x) - 1.0 : 1.0 - sqrt(2.0 - (2.0 * x));
}

void main(void){
    Camera camera = Camera(camera_position, normalize(camera_up), normalize(camera_direction), screen_dist);
    float screen_width = 3.0;
    float screen_height = 3.0;

    vec3 screen_x = normalize(cross(camera.direction, camera.up)) * screen_width;
    vec3 screen_y = normalize(cross(screen_x, camera.direction)) * screen_height;
    vec3 screen_origin = camera.origin + camera.direction * camera.screen_dist;

    vec3 color = vec3(0.0);
    for (int i = 0; i < spp; i++) {
        vec2 dp = rand3(vec3(gl_FragCoord.xy + vec2(float(iterations)), float(i))).xy;
        vec2 dp2 = vec2(tentFilter(dp.x), tentFilter(dp.y));
        vec2 p = (((gl_FragCoord.xy + dp2) * 2.0) - resolution.xy) / min(resolution.x, resolution.y);

        vec3 screen_p = screen_origin + screen_x * p.x + screen_y * p.y;
        Ray ray = Ray(camera.origin, normalize(screen_p - camera.origin));

        color += raytrace(ray);
    }

    vec4 prev = texture(u_texture, v_texcoord);
    vec4 current = vec4(color / float(spp), 1.0);

    outColor = prev + current;
}
