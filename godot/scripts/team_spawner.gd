extends Node3D

const ALLY_COUNT := 19
const ALLY_SCRIPT := preload("res://scripts/ally.gd")

const MODEL := preload("res://fsb_operator.glb")

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

		var model: Node3D = MODEL.instantiate()
		model.position = Vector3.ZERO
		_tint_model(model, Color(0.05, 0.05, 0.05))
		ally.add_child(model)

		var eyes := Node3D.new()
		eyes.name = "Eyes"
		eyes.position = Vector3(0, 0.7, 0)
		ally.add_child(eyes)

		var ray := RayCast3D.new()
		ray.target_position = Vector3(0, 0, -20)
		eyes.add_child(ray)

		get_parent().add_child(ally)

func _tint_model(node: Node, color: Color) -> void:
	if node is MeshInstance3D:
		for i in node.get_surface_override_material_count():
			var mat := StandardMaterial3D.new()
			mat.albedo_color = color
			mat.roughness = 0.8
			node.set_surface_override_material(i, mat)
	for child in node.get_children():
		_tint_model(child, color)
