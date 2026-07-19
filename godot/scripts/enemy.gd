extends CharacterBody3D

const SPEED := 3.5
const SIGHT_RANGE := 18.0
const SIGHT_ANGLE_DEG := 70.0
const FIRE_INTERVAL := 1.2
const FIRE_RANGE := 14.0
const HEALTH_MAX := 100.0

@onready var eyes: Node3D = $Eyes
@onready var ray: RayCast3D = $Eyes/RayCast3D

var player: Node3D
var health: float = HEALTH_MAX
var fire_cooldown: float = 0.0
var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready() -> void:
	player = get_tree().get_root().find_child("Player", true, false)
	add_to_group("enemies")

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta
	else:
		velocity.y = 0.0

	if player and can_see_player():
		look_at(Vector3(player.global_position.x, global_position.y, player.global_position.z), Vector3.UP)
		var to_player := (player.global_position - global_position)
		to_player.y = 0
		var dist := to_player.length()
		if dist > FIRE_RANGE * 0.5:
			var dir := to_player.normalized()
			velocity.x = dir.x * SPEED
			velocity.z = dir.z * SPEED
		else:
			velocity.x = move_toward(velocity.x, 0, SPEED)
			velocity.z = move_toward(velocity.z, 0, SPEED)

		fire_cooldown -= delta
		if dist <= FIRE_RANGE and fire_cooldown <= 0.0:
			fire_cooldown = FIRE_INTERVAL
			print(name, " fires at player")
	else:
		velocity.x = move_toward(velocity.x, 0, SPEED)
		velocity.z = move_toward(velocity.z, 0, SPEED)

	move_and_slide()

func can_see_player() -> bool:
	if not player:
		return false
	var to_player := player.global_position - global_position
	if to_player.length() > SIGHT_RANGE:
		return false
	var flat_to_player := Vector3(to_player.x, 0, to_player.z).normalized()
	var forward := -global_transform.basis.z
	var flat_forward := Vector3(forward.x, 0, forward.z).normalized()
	var angle := rad_to_deg(flat_forward.angle_to(flat_to_player))
	if angle > SIGHT_ANGLE_DEG:
		return false
	ray.target_position = ray.to_local(player.global_position + Vector3.UP * 0.8)
	ray.force_raycast_update()
	if ray.is_colliding():
		var hit := ray.get_collider()
		if hit != player and not (hit is Node and hit.is_ancestor_of(player)):
			return false
	return true

func take_damage(amount: float) -> void:
	health -= amount
	if health <= 0:
		queue_free()
