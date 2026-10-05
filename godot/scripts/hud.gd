extends CanvasLayer

@onready var health_bar: ProgressBar = $HealthBar
@onready var ammo_label: Label = $AmmoLabel
@onready var kills_label: Label = $KillsLabel

var kills: int = 0

func update_health(value: float) -> void:
	health_bar.value = value

func update_ammo(current: int, max_ammo: int) -> void:
	ammo_label.text = "%d / %d" % [current, max_ammo]

func add_kill() -> void:
	kills += 1
	kills_label.text = "KILLS: %d" % kills
