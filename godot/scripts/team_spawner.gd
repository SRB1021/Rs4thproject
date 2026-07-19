extends Node3D

const ALLY_COUNT := 19
const ALLY_SCRIPT := preload("res://scripts/ally.gd")
const SOLDIER_MODEL := preload("res://swat-operator-remastered/swat_operator_remastered_0.glb")

const OFFSETS := [
	Vector3(-2, 0, 3), Vector3(2, 0, 3), Vector3(0, 0, 4),
	Vector3(-4, 0, 3), Vector3(4, 0, 3), Vector3(-2, 0, 6),
	Vector3(2, 0, 6), Vector3(0, 0, 7), Vector3(-4, 0, 6),
	Vector3(4, 0, 6), Vector3(-6, 0, 4), Vector3(6, 0, 4),
	Vector3(-3, 0, 9), Vector3(3, 0, 9), Vector3(0, 0, 10),
	Vector3(-6, 0, 8), Vector3(6, 0, 8), Vector3(-1, 0, 12),
	Vector3(1, 0, 12),
]

var capsule_shape: CapsuleShape3D = CapsuleShape3D.new()

func _ready() -> void:
	capsule_shape.radius = 0.4
	capsule_shape.height = 1.8

	for i in ALLY_COUNT:
		var ally := CharacterBody3D.new()
		ally.name = "Ally%d" % (i + 1)
		ally.position = OFFSETS[i]
		ally.set_script(ALLY_SCRIPT)

		var col := CollisionShape3D.new()
		col.shape = capsule_shape
		ally.add_child(col)

		# Spawn the SWAT model as the visual
		var model: Node3D = SOLDIER_MODEL.instantiate()
		model.position = Vector3(0, 0, 0)
		ally.add_child(model)

		var eyes := Node3D.new()
		eyes.name = "Eyes"
		eyes.position = Vector3(0, 0.7, 0)
		ally.add_child(eyes)

		var ray := RayCast3D.new()
		ray.target_position = Vector3(0, 0, -20)
		eyes.add_child(ray)

		get_parent().add_child(ally)
