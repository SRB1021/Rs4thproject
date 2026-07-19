extends CharacterBody3D

const SPEED := 4.0
const FOLLOW_DIST := 4.0
const SIGHT_RANGE := 20.0
const FIRE_INTERVAL := 1.5
const FIRE_RANGE := 16.0
const HEALTH_MAX := 100.0

@onready var eyes: Node3D = $Eyes
@onready var ray: RayCast3D = $Eyes/RayCast3D

var player: Node3D
var health: float = HEALTH_MAX
var fire_cooldown: float = 0.0
var offset: Vector3 = Vector3.ZERO
var gravity: float = ProjectSettings.get_setting("physics/3d/default_gravity")

func _ready() -> void:
	player = get_tree().get_root().find_child("Player", true, false)

func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= gravity * delta
	else:
		velocity.y = 0.0

	var nearest_enemy := find_nearest_enemy()

	if nearest_enemy and can_see(nearest_enemy):
		# Face and engage enemy
		look_at(Vector3(nearest_enemy.global_position.x, global_position.y, nearest_enemy.global_position.z), Vector3.UP)
		var dist := global_position.distance_to(nearest_enemy.global_position)
		if dist > FIRE_RANGE * 0.5:
			move_toward_target(nearest_enemy.global_position, delta)
		else:
			velocity.x = move_toward(velocity.x, 0, SPEED)
			velocity.z = move_toward(velocity.z, 0, SPEED)
		fire_cooldown -= delta
		if dist <= FIRE_RANGE and fire_cooldown <= 0.0:
			fire_cooldown = FIRE_INTERVAL
			nearest_enemy.take_damage(15.0 + randf() * 10.0)
	elif player:
		# Follow player in formation
		var target := player.global_position + offset
		var dist := global_position.distance_to(target)
		if dist > FOLLOW_DIST * 0.5:
			look_at(Vector3(target.x, global_position.y, target.z), Vector3.UP)
			move_toward_target(target, delta)
		else:
			velocity.x = move_toward(velocity.x, 0, SPEED)
			velocity.z = move_toward(velocity.z, 0, SPEED)

	move_and_slide()

func move_toward_target(target: Vector3, delta: float) -> void:
	var dir := (target - global_position)
	dir.y = 0
	dir = dir.normalized()
	velocity.x = dir.x * SPEED
	velocity.z = dir.z * SPEED

func find_nearest_enemy() -> Node:
	var enemies := get_tree().get_nodes_in_group("enemies")
	var nearest: Node = null
	var nearest_dist := SIGHT_RANGE
	for e in enemies:
		var d := global_position.distance_to(e.global_position)
		if d < nearest_dist:
			nearest_dist = d
			nearest = e
	return nearest

func can_see(target: Node3D) -> bool:
	var to_target := target.global_position - global_position
	if to_target.length() > SIGHT_RANGE:
		return false
	ray.target_position = ray.to_local(target.global_position + Vector3.UP * 0.8)
	ray.force_raycast_update()
	if ray.is_colliding():
		var hit := ray.get_collider()
		if hit != target and not (hit is Node and hit.is_ancestor_of(target)):
			return false
	return true

func take_damage(amount: float) -> void:
	health -= amount
	if health <= 0:
		queue_free()
