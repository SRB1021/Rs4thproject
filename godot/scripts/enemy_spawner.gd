extends Node3D

const ENEMY_COUNT := 20
const ENEMY_SCRIPT := preload("res://scripts/enemy.gd")

@onready var torso_mesh: BoxMesh = BoxMesh.new()
@onready var vest_mesh: BoxMesh = BoxMesh.new()
@onready var head_mesh: BoxMesh = BoxMesh.new()
@onready var helmet_mesh: BoxMesh = BoxMesh.new()
@onready var leg_mesh: BoxMesh = BoxMesh.new()
@onready var rifle_mesh: BoxMesh = BoxMesh.new()

@onready var uniform_mat: StandardMaterial3D = StandardMaterial3D.new()
@onready var vest_mat: StandardMaterial3D = StandardMaterial3D.new()
@onready var helmet_mat: StandardMaterial3D = StandardMaterial3D.new()
@onready var rifle_mat: StandardMaterial3D = StandardMaterial3D.new()
@onready var capsule_shape: CapsuleShape3D = CapsuleShape3D.new()

# Spread enemies around the far parts of the map
const SPAWN_POSITIONS := [
	Vector3(20, 1, -30), Vector3(-20, 1, -30), Vector3(35, 1, -20),
	Vector3(-35, 1, -20), Vector3(40, 1, -40), Vector3(-40, 1, -40),
	Vector3(15, 1, -50), Vector3(-15, 1, -50), Vector3(50, 1, -15),
	Vector3(-50, 1, -15), Vector3(30, 1, -45), Vector3(-30, 1, -45),
	Vector3(55, 1, -30), Vector3(-55, 1, -30), Vector3(10, 1, -55),
	Vector3(-10, 1, -55), Vector3(45, 1, -55), Vector3(-45, 1, -55),
	Vector3(0, 1, -60), Vector3(60, 1, -45),
]

func _ready() -> void:
	torso_mesh.size = Vector3(0.46, 0.6, 0.26)
	vest_mesh.size = Vector3(0.48, 0.56, 0.28)
	head_mesh.size = Vector3(0.34, 0.34, 0.3)
	helmet_mesh.size = Vector3(0.38, 0.22, 0.36)
	leg_mesh.size = Vector3(0.16, 0.6, 0.16)
	rifle_mesh.size = Vector3(0.07, 0.08, 0.6)
	capsule_shape.radius = 0.4
	capsule_shape.height = 1.8

	# Enemy uniform: darker grey-green to distinguish from allies
	uniform_mat.albedo_color = Color(0.25, 0.22, 0.16)
	uniform_mat.roughness = 0.9
	vest_mat.albedo_color = Color(0.12, 0.10, 0.08)
	vest_mat.roughness = 0.85
	helmet_mat.albedo_color = Color(0.15, 0.13, 0.10)
	helmet_mat.roughness = 0.8
	rifle_mat.albedo_color = Color(0.06, 0.06, 0.06)
	rifle_mat.roughness = 0.7
	rifle_mat.metallic = 0.4

	for i in ENEMY_COUNT:
		var enemy := CharacterBody3D.new()
		enemy.name = "Enemy%d" % (i + 1)
		enemy.position = SPAWN_POSITIONS[i]
		enemy.set_script(ENEMY_SCRIPT)

		var col := CollisionShape3D.new()
		col.shape = capsule_shape
		enemy.add_child(col)

		_add_mesh(enemy, Vector3(0, 1.1, 0), torso_mesh, uniform_mat)
		_add_mesh(enemy, Vector3(0, 1.12, 0), vest_mesh, vest_mat)
		_add_mesh(enemy, Vector3(0, 1.72, 0), head_mesh, uniform_mat)
		_add_mesh(enemy, Vector3(0, 1.86, 0), helmet_mesh, helmet_mat)
		_add_mesh(enemy, Vector3(-0.13, 0.42, 0), leg_mesh, uniform_mat)
		_add_mesh(enemy, Vector3(0.13, 0.42, 0), leg_mesh, uniform_mat)
		_add_mesh(enemy, Vector3(0.2, 1.05, 0.22), rifle_mesh, rifle_mat)

		var eyes := Node3D.new()
		eyes.name = "Eyes"
		eyes.position = Vector3(0, 0.7, 0)
		enemy.add_child(eyes)

		var ray := RayCast3D.new()
		ray.target_position = Vector3(0, 0, -18)
		eyes.add_child(ray)

		get_parent().add_child(enemy)

func _add_mesh(parent: Node3D, pos: Vector3, mesh: Mesh, mat: Material) -> void:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.position = pos
	mi.set_surface_override_material(0, mat)
	parent.add_child(mi)
