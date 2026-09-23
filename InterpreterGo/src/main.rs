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

    let result = run_source(startwaarden_src, modelregels_src, 10_000);

    if !result.ok {
        for err in &result.errors {
            eprintln!("[{}] {}:{}: {}", err.block, err.line, err.column, err.message);
        }
        return;
    }

    println!("{:>8} {:>10} {:>10}", "t", "x", "v");
    for stap in &result.history {
        println!(
            "{:>8.3} {:>10.4} {:>10.4}",
            stap.get("t").unwrap_or(&0.0),
            stap.get("x").unwrap_or(&0.0),
            stap.get("v").unwrap_or(&0.0)
        );
    }

    println!("\nnumber of timesteps: {}", result.history.len());
}