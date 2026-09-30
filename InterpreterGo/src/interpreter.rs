use crate::compile::{AssignOp, CmpOp, Cond, Expr, Func, Pos, Stmt};
use crate::{error, RunError};

pub enum StepResult {
    Continue,
    Stop,
}

type Eval<T> = Result<T, RunError>;

/// Measured values (e.g. points tracked in a video) that the code can read as a variable.
/// `t` is sorted ascending and has the same length as `values`.
#[derive(serde::Deserialize, Clone, Debug)]
pub struct DataSeries {
    pub name: String,
    pub t: Vec<f64>,
    pub values: Vec<f64>,
}

impl DataSeries {
    /// Linear interpolation at time `t`; NaN outside the measured range, so a
    /// calculation with it gives no value instead of a made-up one
    pub fn at(&self, t: f64) -> f64 {
        let (first, last) = match (self.t.first(), self.t.last()) {
            (Some(&first), Some(&last)) => (first, last),
            _ => return f64::NAN,
        };
        if !(t >= first && t <= last) {
            return f64::NAN;
        }
        // First sample at or after t
        let i = self.t.partition_point(|&ti| ti < t);
        if self.t[i] == t || i == 0 {
            return self.values[i];
        }
        let (t0, t1) = (self.t[i - 1], self.t[i]);
        let (v0, v1) = (self.values[i - 1], self.values[i]);
        v0 + (t - t0) / (t1 - t0) * (v1 - v0)
    }
}

/// The variables while a model runs: a value per slot, and whether it has one yet
pub struct Machine<'a> {
    pub names: &'a [String],
    pub values: Vec<f64>,
    pub defined: Vec<bool>,
}

impl Machine<'_> {
    fn get(&self, slot: usize, pos: Pos) -> Eval<f64> {
        if self.defined[slot] {
            return Ok(self.values[slot]);
        }
        let name = &self.names[slot];
        Err(error(pos, "no_value", &[("name", name.clone())], format!("'{name}' has no value yet; give it one before using it")))
    }

    pub fn set(&mut self, slot: usize, value: f64) {
        self.values[slot] = value;
        self.defined[slot] = true;
    }

    fn eval(&self, e: &Expr) -> Eval<f64> {
        Ok(match e {
            Expr::Num(v) => *v,
            Expr::Var(slot, pos) => self.get(*slot, *pos)?,
            Expr::Neg(a) => -self.eval(a)?,
            Expr::Add(a, b) => self.eval(a)? + self.eval(b)?,
            Expr::Sub(a, b) => self.eval(a)? - self.eval(b)?,
            Expr::Mul(a, b) => self.eval(a)? * self.eval(b)?,
            Expr::Div(a, b) => self.eval(a)? / self.eval(b)?,
            Expr::Pow(a, b) => self.eval(a)?.powf(self.eval(b)?),
            Expr::Call(func, args) => {
                let values = args.iter().map(|a| self.eval(a)).collect::<Eval<Vec<f64>>>()?;
                call(*func, &values)
            }
        })
    }

    fn test(&self, c: &Cond) -> Eval<bool> {
        Ok(match c {
            Cond::Cmp(op, a, b) => {
                let (lhs, rhs) = (self.eval(a)?, self.eval(b)?);
                match op {
                    CmpOp::Le => lhs <= rhs,
                    CmpOp::Ge => lhs >= rhs,
                    CmpOp::Eq => (lhs - rhs).abs() < 1e-12,
                    CmpOp::Ne => (lhs - rhs).abs() >= 1e-12,
                    CmpOp::Lt => lhs < rhs,
                    CmpOp::Gt => lhs > rhs,
                }
            }
            // Evaluated left to right and only as far as needed, like reading it aloud
            Cond::And(parts) => {
                for part in parts {
                    if !self.test(part)? {
                        return Ok(false);
                    }
                }
                true
            }
            Cond::Or(parts) => {
                for part in parts {
                    if self.test(part)? {
                        return Ok(true);
                    }
                }
                false
            }
            Cond::Not(inner) => !self.test(inner)?,
        })
    }

    pub fn run(&mut self, statements: &[Stmt]) -> Eval<StepResult> {
        for statement in statements {
            match statement {
                Stmt::Assign { slot, op, value, pos } => {
                    let value = self.eval(value)?;
                    let new_value = match op {
                        AssignOp::Set => value,
                        _ if !self.defined[*slot] => {
                            let (name, symbol) = (&self.names[*slot], op.symbol());
                            return Err(error(
                                *pos,
                                "no_value_update",
                                &[("name", name.clone()), ("op", symbol.to_string())],
                                format!("'{name}' has no value yet, so '{symbol}' can't update it"),
                            ));
                        }
                        AssignOp::Add => self.values[*slot] + value,
                        AssignOp::Sub => self.values[*slot] - value,
                        AssignOp::Mul => self.values[*slot] * value,
                        AssignOp::Div => self.values[*slot] / value,
                    };
                    self.set(*slot, new_value);
                }
                Stmt::If { branches, otherwise } => {
                    let mut taken: &[Stmt] = otherwise;
                    for (cond, body) in branches {
                        if self.test(cond)? {
                            taken = body;
                            break;
                        }
                    }
                    if let StepResult::Stop = self.run(taken)? {
                        return Ok(StepResult::Stop);
                    }
                }
                Stmt::Stop(cond) => {
                    if self.test(cond)? {
                        return Ok(StepResult::Stop);
                    }
                }
            }
        }
        Ok(StepResult::Continue)
    }
}

fn call(func: Func, a: &[f64]) -> f64 {
    match func {
        Func::Sin => a[0].sin(),
        Func::Cos => a[0].cos(),
        Func::Tan => a[0].tan(),
        Func::Asin => a[0].asin(),
        Func::Acos => a[0].acos(),
        Func::Atan => a[0].atan(),
        Func::Atan2 => a[0].atan2(a[1]),
        Func::Sqrt => a[0].sqrt(),
        Func::Abs => a[0].abs(),
        Func::Exp => a[0].exp(),
        Func::Ln => a[0].ln(),
        Func::Log => a[0].log10(),
        // NaN in, NaN out: a missing value shouldn't quietly disappear from a minimum
        Func::Min => a.iter().copied().fold(f64::INFINITY, |m, x| if x.is_nan() || m.is_nan() { f64::NAN } else { m.min(x) }),
        Func::Max => a.iter().copied().fold(f64::NEG_INFINITY, |m, x| if x.is_nan() || m.is_nan() { f64::NAN } else { m.max(x) }),
        Func::Round => a[0].round(),
        Func::Floor => a[0].floor(),
        Func::Ceil => a[0].ceil(),
        Func::Sign => {
            if a[0] > 0.0 {
                1.0
            } else if a[0] < 0.0 {
                -1.0
            } else {
                a[0] // 0, -0 or NaN
            }
        }
        Func::Hypot => a[0].hypot(a[1]),
    }
}
