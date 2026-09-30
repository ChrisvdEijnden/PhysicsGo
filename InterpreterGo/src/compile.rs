//! Turns parsed code into a tree that runs fast: every variable gets a numbered slot and every
//! function is looked up once, before the first step, instead of on every step. Unknown functions
//! and wrong numbers of arguments are reported here, even in branches that never run.

use crate::indent::SourcePos;
use crate::{error, Rule, RunError};
use pest::iterators::{Pair, Pairs};

/// Where something is in the user's code, for error messages
#[derive(Clone, Copy, Debug)]
pub struct Pos {
    pub block: &'static str,
    pub line: usize,
    pub column: usize,
}

#[derive(Clone, Copy, Debug)]
pub enum Func {
    Sin, Cos, Tan, Asin, Acos, Atan, Atan2, Sqrt, Abs, Exp, Ln, Log, Min, Max, Round, Floor, Ceil, Sign, Hypot,
}

/// How many values a function takes: exactly `min` when `max` equals it, otherwise at least `min`.
/// Every function has an English name and a Dutch one (often the same); both work in any code.
pub struct FunctionInfo {
    pub name: &'static str,
    pub nl: &'static str,
    pub func: Func,
    pub min: usize,
    pub max: Option<usize>,
}

const fn f(name: &'static str, nl: &'static str, func: Func, min: usize, max: Option<usize>) -> FunctionInfo {
    FunctionInfo { name, nl, func, min, max }
}

/// The built-in functions. The app's syntax highlighting, autocomplete and translation read this same list.
pub const FUNCTIONS: &[FunctionInfo] = &[
    f("sin", "sin", Func::Sin, 1, Some(1)),
    f("cos", "cos", Func::Cos, 1, Some(1)),
    f("tan", "tan", Func::Tan, 1, Some(1)),
    f("asin", "arcsin", Func::Asin, 1, Some(1)),
    f("acos", "arccos", Func::Acos, 1, Some(1)),
    f("atan", "arctan", Func::Atan, 1, Some(1)),
    f("atan2", "arctan2", Func::Atan2, 2, Some(2)),
    f("sqrt", "wortel", Func::Sqrt, 1, Some(1)),
    f("abs", "abs", Func::Abs, 1, Some(1)),
    f("exp", "exp", Func::Exp, 1, Some(1)),
    f("ln", "ln", Func::Ln, 1, Some(1)),
    f("log", "log", Func::Log, 1, Some(1)),
    f("min", "min", Func::Min, 1, None),
    f("max", "max", Func::Max, 1, None),
    f("round", "afronden", Func::Round, 1, Some(1)),
    f("floor", "entier", Func::Floor, 1, Some(1)),
    f("ceil", "plafond", Func::Ceil, 1, Some(1)),
    f("sign", "teken", Func::Sign, 1, Some(1)),
    f("hypot", "hypot", Func::Hypot, 2, Some(2)),
];

/// Values every model can use without defining them; a model that assigns one of these names
/// (e.g. `e = 1.6e-19` for the elementary charge) uses its own value instead
pub const CONSTANTS: &[(&str, f64)] = &[("pi", std::f64::consts::PI), ("e", std::f64::consts::E)];

/// Keywords as (Dutch, English) pairs; the grammar accepts both in any code
pub const KEYWORDS: &[(&str, &str)] = &[("als", "if"), ("anders", "else"), ("stop", "stop"), ("en", "and"), ("of", "or"), ("niet", "not")];

#[derive(Debug)]
pub enum Expr {
    Num(f64),
    Var(usize, Pos),
    Neg(Box<Expr>),
    Add(Box<Expr>, Box<Expr>),
    Sub(Box<Expr>, Box<Expr>),
    Mul(Box<Expr>, Box<Expr>),
    Div(Box<Expr>, Box<Expr>),
    Pow(Box<Expr>, Box<Expr>),
    Call(Func, Vec<Expr>),
}

#[derive(Clone, Copy, Debug)]
pub enum CmpOp { Le, Ge, Eq, Ne, Lt, Gt }

#[derive(Debug)]
pub enum Cond {
    Cmp(CmpOp, Expr, Expr),
    And(Vec<Cond>),
    Or(Vec<Cond>),
    Not(Box<Cond>),
}

#[derive(Clone, Copy, Debug)]
pub enum AssignOp { Set, Add, Sub, Mul, Div }

impl AssignOp {
    pub fn symbol(self) -> &'static str {
        match self {
            AssignOp::Set => "=",
            AssignOp::Add => "+=",
            AssignOp::Sub => "-=",
            AssignOp::Mul => "*=",
            AssignOp::Div => "/=",
        }
    }
}

#[derive(Debug)]
pub enum Stmt {
    Assign { slot: usize, op: AssignOp, value: Expr, pos: Pos },
    /// `als` and any `anders als` branches in order, then `anders` (empty when there's none)
    If { branches: Vec<(Cond, Vec<Stmt>)>, otherwise: Vec<Stmt> },
    Stop(Cond),
}

/// A block of code (start values or model rules) and how its braced lines map back to the user's lines
pub struct Block<'a> {
    pub name: &'static str,
    pub line_map: &'a [SourcePos],
}

impl Block<'_> {
    pub fn pos(&self, pair: &Pair<Rule>) -> Pos {
        let (line, column) = pair.line_col();
        match self.line_map.get(line.saturating_sub(1)) {
            Some(p) => Pos { block: self.name, line: p.line, column: column + p.indent },
            None => Pos { block: self.name, line, column },
        }
    }
}

/// Names of the variables in slot order, and which names were assigned somewhere
pub struct Slots {
    pub names: Vec<String>,
    assigned: Vec<bool>,
}

impl Slots {
    pub fn new() -> Self {
        Slots { names: Vec::new(), assigned: Vec::new() }
    }

    pub fn slot(&mut self, name: &str) -> usize {
        match self.names.iter().position(|n| n == name) {
            Some(i) => i,
            None => {
                self.names.push(name.to_string());
                self.assigned.push(false);
                self.names.len() - 1
            }
        }
    }

    pub fn find(&self, name: &str) -> Option<usize> {
        self.names.iter().position(|n| n == name)
    }

    fn is_assigned(&self, name: &str) -> bool {
        self.find(name).is_some_and(|i| self.assigned[i])
    }
}

/// First pass: every assigned name gets a slot, in the order the code assigns them, so a constant's
/// name that the code assigns (e.g. `e`) is known to be the code's own variable
pub fn collect_assigned(program: &Pairs<Rule>, slots: &mut Slots) {
    for pair in program.clone().flatten() {
        if pair.as_rule() == Rule::assignment {
            let name = pair.into_inner().next().unwrap().as_str();
            let i = slots.slot(name);
            slots.assigned[i] = true;
        }
    }
}

pub fn compile_block(program: Pairs<Rule>, block: &Block, slots: &mut Slots) -> Result<Vec<Stmt>, RunError> {
    program
        .filter(|p| p.as_rule() == Rule::statement)
        .map(|p| statement(p, block, slots))
        .collect()
}

fn statement(pair: Pair<Rule>, block: &Block, slots: &mut Slots) -> Result<Stmt, RunError> {
    let inner = pair.into_inner().next().unwrap();
    match inner.as_rule() {
        Rule::assignment => {
            let mut parts = inner.into_inner();
            let name = parts.next().unwrap();
            let op = match parts.next().unwrap().as_str() {
                "+=" => AssignOp::Add,
                "-=" => AssignOp::Sub,
                "*=" => AssignOp::Mul,
                "/=" => AssignOp::Div,
                _ => AssignOp::Set,
            };
            let value = expr(parts.next().unwrap(), block, slots)?;
            Ok(Stmt::Assign { slot: slots.slot(name.as_str()), op, value, pos: block.pos(&name) })
        }
        Rule::if_stmt => {
            let mut branches = Vec::new();
            let mut otherwise = Vec::new();
            let mut parts = inner.into_inner();
            parts.next(); // als
            let cond = condition(parts.next().unwrap(), block, slots)?;
            branches.push((cond, statements(parts.next().unwrap(), block, slots)?));
            for clause in parts {
                match clause.as_rule() {
                    Rule::else_if_clause => {
                        let mut c = clause.into_inner();
                        c.next(); // anders
                        c.next(); // als
                        let cond = condition(c.next().unwrap(), block, slots)?;
                        branches.push((cond, statements(c.next().unwrap(), block, slots)?));
                    }
                    Rule::else_clause => {
                        let mut c = clause.into_inner();
                        c.next(); // anders
                        otherwise = statements(c.next().unwrap(), block, slots)?;
                    }
                    _ => unreachable!(),
                }
            }
            Ok(Stmt::If { branches, otherwise })
        }
        Rule::stop_stmt => {
            let mut parts = inner.into_inner();
            parts.next(); // stop
            parts.next(); // als
            Ok(Stmt::Stop(condition(parts.next().unwrap(), block, slots)?))
        }
        _ => unreachable!(),
    }
}

fn statements(block_pair: Pair<Rule>, block: &Block, slots: &mut Slots) -> Result<Vec<Stmt>, RunError> {
    block_pair
        .into_inner()
        .filter(|p| p.as_rule() == Rule::statement)
        .map(|p| statement(p, block, slots))
        .collect()
}

fn condition(pair: Pair<Rule>, block: &Block, slots: &mut Slots) -> Result<Cond, RunError> {
    match pair.as_rule() {
        Rule::condition => condition(pair.into_inner().next().unwrap(), block, slots),
        Rule::or_cond | Rule::and_cond => {
            let is_or = pair.as_rule() == Rule::or_cond;
            let parts = pair
                .into_inner()
                .filter(|p| !matches!(p.as_rule(), Rule::or_kw | Rule::and_kw))
                .map(|p| condition(p, block, slots))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(match (parts.len(), is_or) {
                (1, _) => parts.into_iter().next().unwrap(),
                (_, true) => Cond::Or(parts),
                (_, false) => Cond::And(parts),
            })
        }
        Rule::not_cond => {
            let mut inner = pair.into_inner();
            let first = inner.next().unwrap();
            if first.as_rule() == Rule::not_kw {
                Ok(Cond::Not(Box::new(condition(inner.next().unwrap(), block, slots)?)))
            } else {
                condition(first, block, slots)
            }
        }
        Rule::comparison => {
            let mut inner = pair.into_inner();
            let lhs = expr(inner.next().unwrap(), block, slots)?;
            let op = match inner.next().unwrap().as_str() {
                "<=" => CmpOp::Le,
                ">=" => CmpOp::Ge,
                "==" => CmpOp::Eq,
                "!=" => CmpOp::Ne,
                "<" => CmpOp::Lt,
                _ => CmpOp::Gt,
            };
            let rhs = expr(inner.next().unwrap(), block, slots)?;
            Ok(Cond::Cmp(op, lhs, rhs))
        }
        other => unreachable!("unexpected rule in condition: {other:?}"),
    }
}

fn expr(pair: Pair<Rule>, block: &Block, slots: &mut Slots) -> Result<Expr, RunError> {
    match pair.as_rule() {
        Rule::expr | Rule::term => {
            let mut inner = pair.into_inner();
            let mut acc = expr(inner.next().unwrap(), block, slots)?;
            while let Some(op) = inner.next() {
                let rhs = Box::new(expr(inner.next().unwrap(), block, slots)?);
                let lhs = Box::new(acc);
                acc = match op.as_rule() {
                    Rule::add => Expr::Add(lhs, rhs),
                    Rule::sub => Expr::Sub(lhs, rhs),
                    Rule::mul => Expr::Mul(lhs, rhs),
                    _ => Expr::Div(lhs, rhs),
                };
            }
            Ok(acc)
        }
        Rule::power => {
            let mut inner = pair.into_inner();
            let base = expr(inner.next().unwrap(), block, slots)?;
            match inner.next() {
                Some(_pow) => Ok(Expr::Pow(Box::new(base), Box::new(expr(inner.next().unwrap(), block, slots)?))),
                None => Ok(base),
            }
        }
        Rule::unary => {
            let mut inner = pair.into_inner();
            let first = inner.next().unwrap();
            if first.as_rule() == Rule::sub_op {
                Ok(Expr::Neg(Box::new(expr(inner.next().unwrap(), block, slots)?)))
            } else {
                expr(first, block, slots)
            }
        }
        Rule::atom => expr(pair.into_inner().next().unwrap(), block, slots),
        Rule::number => Ok(Expr::Num(pair.as_str().parse().unwrap())),
        Rule::identifier => {
            let name = pair.as_str();
            if !slots.is_assigned(name) {
                if let Some((_, value)) = CONSTANTS.iter().find(|(c, _)| *c == name) {
                    return Ok(Expr::Num(*value));
                }
            }
            Ok(Expr::Var(slots.slot(name), block.pos(&pair)))
        }
        Rule::function_call => {
            let mut inner = pair.into_inner();
            let name_pair = inner.next().unwrap();
            let name = name_pair.as_str();
            let args = inner.map(|a| expr(a, block, slots)).collect::<Result<Vec<_>, _>>()?;
            let pos = block.pos(&name_pair);
            let Some(info) = FUNCTIONS.iter().find(|f| f.name == name || f.nl == name) else {
                let available = FUNCTIONS.iter().map(|f| f.name).collect::<Vec<_>>().join(", ");
                return Err(error(
                    pos,
                    "unknown_function",
                    &[("name", name.to_string()), ("available", available.clone())],
                    format!("unknown function '{name}'; available: {available}"),
                ));
            };
            let fits = args.len() >= info.min && info.max.is_none_or(|max| args.len() <= max);
            if !fits {
                let expected = match info.max {
                    Some(max) if max == info.min => info.min.to_string(),
                    _ => format!("{}+", info.min),
                };
                return Err(error(
                    pos,
                    "wrong_arguments",
                    &[("name", name.to_string()), ("expected", expected.clone()), ("given", args.len().to_string())],
                    format!("'{name}' takes {expected} value(s), not {}", args.len()),
                ));
            }
            Ok(Expr::Call(info.func, args))
        }
        other => unreachable!("unexpected rule in expr: {other:?}"),
    }
}
