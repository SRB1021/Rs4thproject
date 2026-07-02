extends OmniLight3D

var base_energy: float = 3.5
var time: float = 0.0

func _process(delta: float) -> void:
	time += delta
	light_energy = base_energy \
		+ sin(time * 11.3) * 0.7 \
		+ sin(time * 7.1) * 0.4 \
		+ sin(time * 19.7) * 0.2
