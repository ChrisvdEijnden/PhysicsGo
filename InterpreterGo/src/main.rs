use interpreterGo::run_source;

fn main() {
    let startwaarden_src = "
t = 0
dt = 0.01
x = 10
v = 0
g = 9.81
";

    let modelregels_src = "
a = -g
v = v + a * dt
x = x + v * dt

als x <= 0:
    x = 0
    v = -0.8 * v

stop als t >= 10
";

    let sim = match run_source(startwaarden_src, modelregels_src, 10_000) {
        Ok(sim) => sim,
        Err(err) => {
            eprintln!("[{}] {}:{}: {}", err.block, err.line, err.column, err.message);
            return;
        }
    };

    let names = sim.recorded_names();
    let column = |name: &str| &sim.columns[names.iter().position(|n| n == name).unwrap()];
    let (t, x, v) = (column("t"), column("x"), column("v"));
    println!("{:>8} {:>10} {:>10}", "t", "x", "v");
    for i in 0..t.len() {
        println!("{:>8.3} {:>10.4} {:>10.4}", t[i], x[i], v[i]);
    }

    println!("\nnumber of timesteps: {} ({:?})", sim.steps, sim.finished);
}
