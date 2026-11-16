//! Root policy: deterministic argmax or Boltzmann sampling (04 §2).

/// Gap cap $Q_\text{cap}$ in pawn units (04 Eq. (1)): no move is treated as
/// more than this far below the best one.
pub const Q_CAP: f32 = 20.0;

/// SplitMix64 finaliser.
#[inline]
pub fn splitmix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9e37_79b9_7f4a_7c15);
    z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
    z ^ (z >> 31)
}

/// Counter-based uniform draw in [0, 1) keyed by (seed, game, position hash,
/// ply). A decision depends only on these values (04 §2, R3); the game
/// counter keeps games against deterministic opponents from repeating.
pub fn uniform(seed: u64, game: u64, position: u64, ply: u32) -> f64 {
    let key = splitmix64(game ^ splitmix64(position ^ splitmix64(u64::from(ply))));
    let z = splitmix64(seed ^ key);
    (z >> 11) as f64 / (1u64 << 53) as f64
}

/// Boltzmann probabilities $\pi_\tau$ for root scores `q` (pawn units), with
/// $\hat Q(m) = \max(Q(m),\, \max Q - Q_\text{cap})$ (04 Eq. (1)).
/// `tau <= 0` puts all mass on the first maximum.
pub fn probabilities(q: &[f32], tau: f32) -> Vec<f64> {
    if q.is_empty() {
        return Vec::new();
    }
    let max_q = q.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
    let capped: Vec<f64> = q.iter().map(|&v| f64::from(v.max(max_q - Q_CAP))).collect();
    let max = f64::from(max_q);
    if tau <= 0.0 {
        let best = capped.iter().position(|&v| v == max).unwrap_or(0);
        return (0..q.len())
            .map(|i| if i == best { 1.0 } else { 0.0 })
            .collect();
    }
    let weights: Vec<f64> = capped
        .iter()
        .map(|&v| libm::exp((v - max) / f64::from(tau)))
        .collect();
    let z: f64 = weights.iter().sum();
    weights.iter().map(|w| w / z).collect()
}

/// Index drawn from `probs` with uniform variate `u`.
pub fn sample(probs: &[f64], u: f64) -> usize {
    let mut acc = 0.0;
    for (i, &p) in probs.iter().enumerate() {
        acc += p;
        if u < acc {
            return i;
        }
    }
    probs.len().saturating_sub(1)
}

/// Policy entropy $H_\pi = -\sum \pi \ln \pi$ in nats.
pub fn entropy(probs: &[f64]) -> f64 {
    probs
        .iter()
        .filter(|&&p| p > 0.0)
        .map(|&p| -p * libm::log(p))
        .sum()
}
