mod indent;
mod interpreter;

use pest::Parser;
use pest_derive::Parser;

#[derive(Parser)]
#[grammar = "grammar.pest"]
struct PhysicsGoParser;

use interpreter::run_simulation;

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

    let start_processed = indent::indent_to_braces(startwaarden_src);
    let model_processed = indent::indent_to_braces(modelregels_src);

    let start_program = PhysicsGoParser::parse(Rule::program, &start_processed)
        .expect("startvalues contain a syntax error")
        .next()
        .unwrap()
        .into_inner();
    let model_program = PhysicsGoParser::parse(Rule::program, &model_processed)
        .expect("model rules contain a mistake")
        .next()
        .unwrap()
        .into_inner();

    let geschiedenis = run_simulation(start_program, model_program, 10_000);

    println!("{:>8} {:>10} {:>10}", "t", "x", "v");
    for stap in &geschiedenis {
        println!(
            "{:>8.3} {:>10.4} {:>10.4}",
            stap.get("t").unwrap_or(&0.0),
            stap.get("x").unwrap_or(&0.0),
            stap.get("v").unwrap_or(&0.0)
        );
    }

    println!("\nnumber of timesteps: {}", geschiedenis.len());
}