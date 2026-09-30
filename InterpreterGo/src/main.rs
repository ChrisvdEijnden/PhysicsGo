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

    let column = |name| result.column(name).unwrap_or(&[]);
    let (t, x, v) = (column("t"), column("x"), column("v"));
    println!("{:>8} {:>10} {:>10}", "t", "x", "v");
    for step in 0..result.rows() {
        println!("{:>8.3} {:>10.4} {:>10.4}", t[step], x[step], v[step]);
    }

    println!("\nnumber of timesteps: {}", result.rows());
}