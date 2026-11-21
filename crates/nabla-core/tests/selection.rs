//! Move selection and policy (03, 04).

mod common;

use nabla_core::board;
use nabla_core::select::{M_MATE, static_eval};
use nabla_core::{EvalConfig, Level, Params, SearchConfig, decide};
use shakmaty::{Chess, Position};

fn config(level: Level) -> SearchConfig {
    SearchConfig {
        level,
        ..SearchConfig::default()
    }
}

fn history(pos: &Chess) -> Vec<u64> {
    vec![board::hash(pos)]
}

#[test]
fn mate_in_one_is_found_at_every_level() {
    let p = Params::default();
    for fen in [
        "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
        "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    ] {
        let pos = common::parse(fen);
        for level in [Level::Field, Level::Quiescent, Level::Reply] {
            let d = decide(&pos, &history(&pos), &p, &config(level));
            let mut after = pos.clone();
            after.play_unchecked(d.best.expect("a move"));
            assert!(after.is_checkmate(), "{fen} at {level:?}");
            assert_eq!(d.candidates[0].q, M_MATE - 1.0);
        }
    }
}

#[test]
fn winning_side_does_not_stalemate() {
    // Qg6 would stalemate the black king.
    let pos = common::parse("7k/8/8/6Q1/8/8/8/K7 w - - 0 1");
    let p = Params::default();
    for level in [Level::Field, Level::Quiescent, Level::Reply] {
        let d = decide(&pos, &history(&pos), &p, &config(level));
        let mut after = pos.clone();
        after.play_unchecked(d.best.expect("a move"));
        assert!(!after.is_stalemate(), "{level:?}");
    }
}

#[test]
fn level_two_never_allows_mate_in_one_when_avoidable() {
    let p = Params::default();
    let cfg = config(Level::Reply);
    for pos in common::random_positions(4, 40).into_iter().step_by(7) {
        let moves = pos.legal_moves();
        let allows_mate = |m| {
            let mut after = pos.clone();
            after.play_unchecked(m);
            after.legal_moves().iter().any(|&r| {
                let mut b = after.clone();
                b.play_unchecked(r);
                b.is_checkmate()
            })
        };
        if moves.iter().all(|&m| allows_mate(m)) {
            continue;
        }
        let d = decide(&pos, &history(&pos), &p, &cfg);
        if let Some(best) = d.best {
            assert!(!allows_mate(best), "{:?}", pos.board());
        }
    }
}

#[test]
fn explanations_sum_to_the_root_score() {
    // Q(m) = e(S) + sum of per-term gradients, whenever the line ends in a
    // static evaluation (03 §6).
    let p = Params::default();
    for level in [Level::Field, Level::Quiescent, Level::Reply] {
        let cfg = config(level);
        let eval_cfg = EvalConfig {
            realisable_capture: level == Level::Field,
            disabled: 0,
        };
        for pos in common::random_positions(2, 30).into_iter().step_by(11) {
            let (_, e_root) = static_eval(&pos, &p, &eval_cfg);
            let d = decide(&pos, &history(&pos), &p, &cfg);
            for c in &d.candidates {
                if let Some(x) = c.explain {
                    let reconstructed = e_root + x.total();
                    assert!(
                        (reconstructed - c.q).abs() < 1e-3,
                        "{level:?} {}: {reconstructed} vs {}",
                        c.uci,
                        c.q
                    );
                }
            }
        }
    }
}

#[test]
fn policy_is_deterministic_and_reproducible() {
    let p = Params::default();
    let pos = common::parse("r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4");
    let mut cfg = config(Level::Quiescent);
    let a = decide(&pos, &history(&pos), &p, &cfg).best;
    let b = decide(&pos, &history(&pos), &p, &cfg).best;
    assert_eq!(a, b);
    cfg.temperature = 1.0;
    cfg.seed = 42;
    let c = decide(&pos, &history(&pos), &p, &cfg).best;
    let d = decide(&pos, &history(&pos), &p, &cfg).best;
    assert_eq!(c, d);
}

#[test]
fn boltzmann_frequencies_match_probabilities() {
    use nabla_core::policy::{probabilities, sample, uniform};
    let q = [0.3f32, 0.0, -0.5, -2.0];
    let probs = probabilities(&q, 0.5);
    let mut counts = [0usize; 4];
    let n = 200_000;
    for i in 0..n {
        counts[sample(&probs, uniform(7, 0, 0xabcdef, i))] += 1;
    }
    for (k, &count) in counts.iter().enumerate() {
        let freq = count as f64 / n as f64;
        assert!(
            (freq - probs[k]).abs() < 0.005,
            "{k}: {freq} vs {}",
            probs[k]
        );
    }
    // e^{-ΔQ/τ}: a move one pawn worse is chosen e^{-2} as often at τ = 0.5.
    let pair = probabilities(&[1.0, 0.0], 0.5);
    assert!((pair[1] / pair[0] - (-2.0f64).exp()).abs() < 1e-6);
}

#[test]
fn repetition_is_scored_as_a_draw() {
    // After Nf3 Nf6 Ng1 Ng8 the start position recurs; Nf3 again would repeat.
    let p = Params::default();
    let start = Chess::default();
    let mut pos = start.clone();
    let mut hist = vec![board::hash(&pos)];
    for uci in ["g1f3", "g8f6", "f3g1", "f6g8"] {
        let m = shakmaty::uci::UciMove::from_ascii(uci.as_bytes())
            .unwrap()
            .to_move(&pos)
            .unwrap();
        pos.play_unchecked(m);
        hist.push(board::hash(&pos));
    }
    let d = decide(&pos, &hist, &p, &config(Level::Field));
    let nf3 = d
        .candidates
        .iter()
        .find(|c| c.uci == "g1f3")
        .expect("Nf3 is legal");
    // Nf3 reaches a position seen before: scored as a draw with contempt.
    assert_eq!(nf3.q, -0.15);
    assert!(nf3.explain.is_none());
}

#[test]
fn level_zero_sees_a_forking_check() {
    // Nc7+ forks king and rook; the check extension follows the forced evasion.
    let pos = common::parse("r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1");
    let d = decide(
        &pos,
        &history(&pos),
        &Params::default(),
        &config(Level::Field),
    );
    assert_eq!(d.candidates[0].uci, "d5c7");
    assert_eq!(d.candidates[0].pv.len(), 2);
}

#[test]
fn gap_cap_keeps_mate_distance_order() {
    use nabla_core::policy::probabilities;
    let probs = probabilities(&[999.0, 997.0, 0.0], 1.0);
    assert!(probs[0] > probs[1] && probs[1] > probs[2], "{probs:?}");
}

#[test]
fn adjacent_defending_king_with_the_move_stops_a_passer() {
    use nabla_core::evaluate;
    let (p, cfg) = (Params::default(), EvalConfig::default());
    let white = evaluate(&common::parse("8/8/8/8/8/8/4P3/3k3K w - - 0 1"), &p, &cfg).pawn;
    let black = evaluate(&common::parse("8/8/8/8/8/8/4P3/3k3K b - - 0 1"), &p, &cfg).pawn;
    assert!(white > 4.0, "unstoppable with White to move: {white}");
    assert!(black < 1.0, "captured with Black to move: {black}");
}

#[test]
fn node_budget_is_respected_and_deterministic() {
    let p = Params::default();
    let pos =
        common::parse("r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10");
    let mut cfg = config(Level::Reply);
    cfg.node_limit = Some(300);
    let a = decide(&pos, &history(&pos), &p, &cfg);
    let b = decide(&pos, &history(&pos), &p, &cfg);
    assert!(a.budget_exhausted);
    assert_eq!(a.best, b.best);
    assert!(pos.legal_moves().contains(&a.best.expect("a move")));
    // The fallback costs at most a few Level 0 evaluations per remaining move.
    assert!(
        a.nodes < 300 + 40 * pos.legal_moves().len() as u64,
        "{}",
        a.nodes
    );
    cfg.node_limit = None;
    assert!(!decide(&pos, &history(&pos), &p, &cfg).budget_exhausted);
}

#[test]
fn node_budget_fallback_uses_realisable_captures() {
    // Qe2 is attacked by defended Re8. Even under a tiny Level 2 node budget
    // that forces Level 0 fallback, White must not blunder Qxe8? because beta_1
    // remains active during fallback scoring.
    let pos = common::parse("4rrk1/ppp2pp1/7p/8/8/8/PPP1QPPP/R5K1 w - - 0 1");
    let p = Params::default();
    let mut cfg = config(Level::Reply);
    cfg.node_limit = Some(8);
    let d = decide(&pos, &history(&pos), &p, &cfg);
    assert!(d.budget_exhausted);
    let best = d
        .best
        .expect("a move")
        .to_uci(shakmaty::CastlingMode::Standard)
        .to_string();
    assert_ne!(best, "e2e8", "budget fallback blundered Qxe8?: {best}");
}

#[test]
fn delta_pruning_keeps_checking_captures_and_passer_captures() {
    let p = Params::default();

    // Level 1 must not delta-prune 2. Qxh7# after 1... Rd4 when White is down
    // material and 2. Qxd8 raises alpha.
    let pos = common::parse("q2r2rk/5ppp/8/8/7Q/3B4/R4PPP/3R3K b - - 0 1");
    let d = decide(&pos, &history(&pos), &p, &config(Level::Quiescent));
    let rd4 = d
        .candidates
        .iter()
        .find(|c| c.uci == "d8d4")
        .expect("Rd4 is legal");
    assert!(
        rd4.q <= -(M_MATE - 3.0),
        "Level 1 missed Qxh7# via delta pruning: q = {}",
        rd4.q
    );

    // King-and-pawn ending: after 1... hxg2 White is on the move in qsearch.
    // 2. c8=Q is tried first (raising alpha by ~7 pawns because Kc6 catches Pc7),
    // and 2. exf7 turns f7 and g6 into two unstoppable passers (outscoring c8=Q).
    // Delta pruning must keep pawn captures when the opponent has no pieces.
    let kp = common::parse("8/2P2p2/2k1P1P1/8/8/7p/6Q1/6K1 b - - 0 1");
    let d_kp = decide(&kp, &history(&kp), &p, &config(Level::Quiescent));
    let hxg2 = d_kp
        .candidates
        .iter()
        .find(|c| c.uci == "h3g2")
        .expect("hxg2 is legal");
    assert!(
        hxg2.pv
            .iter()
            .any(|m| m.to_uci(shakmaty::CastlingMode::Standard).to_string() == "e6f7"),
        "Level 1 delta-pruned the passer-unlocking pawn capture exf7; pv = {:?}",
        hxg2.pv
    );
}
