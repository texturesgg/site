//! The API serves reference files by the catalog in `packages/shared`, and
//! the renderer plays animations by the catalog compiled into `melee-dat`.
//! They are the same table: the site's copy must be the crate's.

#[test]
fn the_sites_catalog_is_the_one_melee_dat_ships() {
    let ours: serde_json::Value = serde_json::from_str(include_str!(
        "../../shared/src/melee-animation-reference.json"
    ))
    .expect("the site's catalog parses");
    let theirs: serde_json::Value =
        serde_json::from_str(melee_dat::catalog::CATALOG_JSON).expect("the crate's catalog parses");
    assert!(
        ours == theirs,
        "packages/shared/src/melee-animation-reference.json differs from melee-dat's \
         data/reference-catalog.json; copy the crate's file over it"
    );
}
