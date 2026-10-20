//! Source-derived slots constrain an untrusted model; they never calculate geography.
use crate::protocol::Query;
use anyhow::{Result, ensure};
use serde_json::{Value, json};
use std::collections::BTreeSet;
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};

fn normalized(value: &str) -> String {
    value
        .nfkd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect()
}
fn words(value: &str) -> Vec<String> {
    normalized(value)
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(String::from)
        .collect()
}
#[derive(Debug, Clone)]
pub enum Grounding {
    Energy {
        place: String,
        radius: u32,
        fuels: Vec<String>,
        cluster: bool,
    },
    Temporal {
        start: String,
        end: String,
    },
}
impl Grounding {
    pub fn from_question(question: &str, places: &Value, previous: Option<&Value>) -> Result<Self> {
        let q = normalized(question);
        let tokens = words(question);
        if tokens
            .iter()
            .any(|s| s == "ridgecrest" || s == "earthquakes")
        {
            let pattern =
                regex_lite::Regex::new(r"\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?")?;
            let spans: Vec<_> = pattern.find_iter(question).collect();
            for span in &spans {
                ensure!(question[span.end()..].chars().next().is_none_or(|c|!c.is_ascii_alphanumeric() && !matches!(c, ':' | '+' | '-')), "Use complete UTC Z timestamps or bare ISO dates");
            }
            let dates: Vec<_> = spans.iter().map(|m| m.as_str()).collect();
            ensure!(
                dates.len() == 2,
                "Temporal requests need two explicit ISO UTC boundaries"
            );
            let instant = |s: &str| -> Result<String> {
                let s = if s.len() == 10 {
                    format!("{s}T00:00:00Z")
                } else {
                    s.into()
                };
                chrono::DateTime::parse_from_rfc3339(&s)?;
                Ok(s)
            };
            let start = instant(dates[0])?;
            let end = instant(dates[1])?;
            ensure!(
                chrono::DateTime::parse_from_rfc3339(&start)?
                    < chrono::DateTime::parse_from_rfc3339(&end)?,
                "Empty temporal interval"
            );
            return Ok(Self::Temporal { start, end });
        }
        let padded = format!(" {} ", tokens.join(" "));
        let mut matches = BTreeSet::new();
        for place in places
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Missing source places"))?
        {
            let mut names = vec![place["name"].as_str().unwrap_or("")];
            if let Some(aliases) = place["aliases"].as_array() {
                names.extend(aliases.iter().filter_map(Value::as_str));
            }
            if names.into_iter().any(|name| {
                !name.is_empty() && padded.contains(&format!(" {} ", words(name).join(" ")))
            }) {
                matches.insert(
                    place["id"]
                        .as_str()
                        .ok_or_else(|| anyhow::anyhow!("Invalid source place ID"))?
                        .to_owned(),
                );
            }
        }
        ensure!(matches.len() <= 1, "Choose one source city per query");
        let narrow = tokens.iter().all(|s| {
            [
                "only",
                "just",
                "hydro",
                "hydroelectric",
                "solar",
                "wind",
                "biomass",
                "geothermal",
                "facilities",
                "plants",
                "please",
            ]
            .contains(&s.as_str())
        });
        let place = matches
            .into_iter()
            .next()
            .or_else(|| {
                if narrow {
                    previous
                        .and_then(|p| p["arguments"]["place_id"].as_str())
                        .map(String::from)
                } else {
                    None
                }
            })
            .ok_or_else(|| anyhow::anyhow!("Name an approved Canadian source city"))?;
        let pattern = regex_lite::Regex::new(
            r"([0-9]+(?:\.[0-9]+)?)\s*(km|kilometers|kilometres|m|meters|metres)\b",
        )?;
        let values: Vec<_> = pattern.captures_iter(&q).collect();
        ensure!(
            values.len() <= 1,
            "Use one explicit distance radius per question"
        );
        let radius = if let Some(value) = values.first() {
            let amount: f64 = value[1].parse()?;
            let metres = amount
                * if value[2].starts_with('k') {
                    1000.0
                } else {
                    1.0
                };
            ensure!(
                metres.is_finite() && metres.fract() == 0.0 && (1.0..=500000.0).contains(&metres),
                "Radius outside the declared metre budget"
            );
            metres as u32
        } else if narrow {
            previous
                .and_then(|p| p["arguments"]["radius_m"].as_u64())
                .unwrap_or(100000) as u32
        } else {
            100000
        };
        let mut fuels = Vec::new();
        for (name, aliases) in [
            ("Hydro", vec!["hydro", "hydroelectric"]),
            ("Solar", vec!["solar"]),
            ("Wind", vec!["wind"]),
            ("Biomass", vec!["biomass"]),
            ("Geothermal", vec!["geothermal"]),
        ] {
            if tokens.iter().any(|s| aliases.contains(&s.as_str())) {
                fuels.push(name.to_string());
            }
        }
        if fuels.is_empty() && tokens.iter().any(|s| s == "renewable" || s == "renewables") {
            fuels = [
                "Biomass",
                "Geothermal",
                "Hydro",
                "Solar",
                "Wave and Tidal",
                "Wind",
            ]
            .map(String::from)
            .to_vec();
        }
        let cluster = tokens.iter().any(|s| {
            [
                "compare", "cluster", "clusters", "group", "groups", "grouping",
            ]
            .contains(&s.as_str())
        }) || (narrow && previous.is_some_and(|p| p["tool"] == "cluster_features"));
        Ok(Self::Energy {
            place,
            radius,
            fuels,
            cluster,
        })
    }
    pub fn constrain_schema(&self, mut schema: Value) -> Value {
        let branches = schema["oneOf"].as_array_mut().unwrap();
        branches.retain(|branch| match self {
            Self::Temporal { .. } => {
                branch["properties"]["tool"]["const"] == "features_during_interval"
            }
            Self::Energy { cluster, .. } => {
                branch["properties"]["tool"]["const"]
                    == if *cluster {
                        "cluster_features"
                    } else {
                        "within_distance"
                    }
            }
        });
        for branch in branches {
            let properties = &mut branch["properties"]["arguments"]["properties"];
            match self {
                Self::Energy {
                    place,
                    radius,
                    fuels,
                    ..
                } => {
                    properties["dataset"] = json!({"const":"wri-canada-power-plants"});
                    properties["place_id"] = json!({"const":place});
                    properties["radius_m"] = json!({"const":radius});
                    properties["fuels"] = json!({"const":fuels});
                    properties["limit"] = json!({"const":100});
                    if properties.get("cluster_radius_m").is_some() {
                        properties["cluster_radius_m"] = json!({"const":10000});
                    }
                }
                Self::Temporal { start, end } => {
                    properties["dataset"] = json!({"const":"usgs-ridgecrest-2019"});
                    properties["start"] = json!({"const":start});
                    properties["end"] = json!({"const":end});
                    properties["limit"] = json!({"const":100});
                }
            }
        }
        schema
    }
    pub fn validate(&self, query: &Query) -> Result<()> {
        let plan = query.plan();
        let args = &plan["arguments"];
        match self {
            Self::Energy {
                place,
                radius,
                fuels,
                cluster,
            } => {
                ensure!(
                    plan["tool"]
                        == if *cluster {
                            "cluster_features"
                        } else {
                            "within_distance"
                        }
                        && args["dataset"] == "wri-canada-power-plants"
                        && args["place_id"] == *place
                        && args["radius_m"] == *radius
                        && args["fuels"] == json!(fuels)
                        && args["limit"] == 100,
                    "Model changed source-grounded request constraints"
                );
                if *cluster {
                    ensure!(
                        args["cluster_radius_m"] == 10000,
                        "Model changed the visible grouping default"
                    );
                }
            }
            Self::Temporal { start, end } => ensure!(
                plan["tool"] == "features_during_interval"
                    && args["dataset"] == "usgs-ridgecrest-2019"
                    && args["start"] == *start
                    && args["end"] == *end
                    && args["limit"] == 100,
                "Model changed the explicit temporal interval"
            ),
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grounded_source_city_named_fuels_and_radius_cannot_be_broadened() {
        let places = json!([{"id":"ne-place-1173","name":"Montréal","aliases":["Montreal"]},{"id":"toronto","name":"Toronto","aliases":[]}]);
        let grounding = Grounding::from_question(
            "Compare hydro and solar within 100 km of Montreal",
            &places,
            None,
        )
        .unwrap();
        let query = Query::ClusterFeatures(crate::protocol::ClusterArgs {
            dataset: "wri-canada-power-plants".into(),
            place_id: "ne-place-1173".into(),
            radius_m: 100000,
            cluster_radius_m: 10000,
            fuels: vec!["Hydro".into(), "Solar".into()],
            limit: 100,
        });
        grounding.validate(&query).unwrap();
        let mut wrong = query.plan();
        wrong["arguments"]["place_id"] = json!("toronto");
        wrong.as_object_mut().unwrap().remove("schema_version");
        assert!(
            grounding
                .validate(&serde_json::from_value(wrong).unwrap())
                .is_err()
        );
        assert!(Grounding::from_question("near Paris", &places, Some(&query.plan())).is_err());
        assert!(Grounding::from_question("Compare Toronto and Montreal", &places, None).is_err());
        assert!(Grounding::from_question("Montréal within 0 km", &places, None).is_err());
    }
}
