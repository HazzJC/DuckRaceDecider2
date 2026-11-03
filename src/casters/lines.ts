import type { EventType } from "../sim/events";

/**
 * Caster line bank. 0 = Captain Drake (hype play-by-play), 1 = Professor Mallard (analyst).
 * Templates: {name} {target} {caster} {element} {prev} {margin} {stat}
 */
type Bank = Partial<Record<EventType | "DRAGON_STEAL" | "BARON_FIGHT" | "INTRO" | "INTRO2" | "FILLER" | "FILLER_STAT" | "OUTRO" | "OUTRO2" | "LEAD_LATE" | "BARON_STEAL" | "SHORTCUT_GOOD" | "SHORTCUT_BAD" | "ICE" | "IGNITE", [string[], string[]]>>;

export const CASTER_LINES: Bank = {
  INTRO: [
    [
      "WELCOME to Summoner's River! The ducks are in the water and the pond is ELECTRIC!",
      "Good evening and welcome to the Quack Championship Series! What a lobby we have tonight!",
      "Ladies, gentlemen and waterfowl, it is RACE NIGHT on Summoner's River!",
    ],
    [],
  ],
  INTRO2: [
    [],
    [
      "I've studied the paddle data, Captain. Nobody here is safe.",
      "Conditions are calm, the bread supply is plentiful. A tactician's pond.",
      "My model gives every duck a chance. My heart says chaos.",
    ],
  ],
  START: [["AND THEY'RE OFF!", "QUAAACK! We are LIVE!", "GO GO GO! Paddles in the water!"], []],
  LEAD_CHANGE: [
    ["{name} takes the lead!", "{name} slides past {prev}!", "NEW LEADER! It's {name}!", "{name} goes to the front!"],
    ["{prev} got a little complacent there.", "Better pathing from {name}, honestly.", "That's the paddle cadence paying off."],
  ],
  LEAD_LATE: [
    ["{name} STEALS THE LEAD LATE!", "OH! {name} at the death, past {prev}!", "LATE SWAP! {name} IN FRONT!"],
    ["You cannot script this. Well, you can. It's seeded. But still.", "{prev} will be watching that replay for weeks."],
  ],
  ICE: [
    ["{target} is FROZEN SOLID!", "ICE on {target}! Chilled to the bone!", "{caster} puts {target} on ICE!"],
    ["A textbook freeze from {caster}.", "That's a full second of nothing for {target}.", "{target} burned their summoner spells earlier. Bad call."],
  ],
  IGNITE: [
    ["IGNITE on {target}! The duck is TOASTED!", "{target} is ON FIRE, and not in the good way!", "{caster} sets {target} ablaze!"],
    ["Ignite cuts paddle speed by more than half.", "Roast duck. Again.", "{caster} has been waiting all race for that."],
  ],
  BLOCK: [
    ["BLOCKED! {target} shrugs it off!", "The shield POPS but {target} lives!", "DENIED! What a bubble from {target}!"],
    ["That's why you pick up the shield.", "{caster} wasted that one completely."],
  ],
  SPELL_DODGE: [["{target} just CLOUDS through it!", "WHIFF! {target} isn't even there!"], ["The Cloud drake buff earning its keep."]],
  POWERUP: [
    ["{name} grabs the {stat}!", "{name} with the {stat} pickup!"],
    ["Good item awareness from {name}.", "That {stat} could swing this."],
  ],
  CHEER: [["The crowd is behind {name}!", "LISTEN TO THAT CROWD for {name}!"], ["Audience participation. I approve."]],
  FIRST_BLOOD: [["FIRST BLOOD to {name}!", "{name} takes the first turret and FIRST BLOOD!"], ["Early tempo to {name}.", "First blood isn't everything. But it's something."]],
  TURRET_HIT: [["{name} eats the turret beam!", "Ouch, {name} paddles straight into the tower shot!"], ["Poor timing on that gate.", "You have to respect tower range, {name}."]],
  DRAGON_SPAWN: [["The DRAGON DRAKE has surfaced!", "Here comes the Drake! Who wants it?"], ["Whoever takes this gets a permanent buff.", "Watch the lanes near the Drake."]],
  DRAGON_TAKEN: [
    ["{name} SECURES THE {element} DRAKE!", "Drake goes to {name}! {element} buff!", "{name} takes the {element} Drake!"],
    ["{element} is a strong pick-up for {name}.", "That's a permanent edge for {name}.", "Objective control wins races."],
  ],
  OBJECTIVE_FIGHT: [
    ["{name} is BRAWLING the Drake!", "{name} squares up to the Dragon Drake!", "It's a scrap at the Drake! {name} is in!"],
    ["Bold. That drake has teeth.", "Every second here is a second lost.", "If someone else arrives, this gets messy."],
  ],
  BARON_FIGHT: [
    ["{name} takes on the BARON GOOSE!", "{name} is fighting the Goose! Absolute madness!"],
    ["That goose has ended careers.", "High risk. Enormous reward."],
  ],
  DRAGON_STEAL: [["SMITE STEAL! {name} SNATCHES THE {element} DRAKE!", "STOLEN! {name} takes the Drake from under their beak!"], ["Cold. Absolutely cold.", "That's the oldest trick in the pond."]],
  DRAGON_BREATH: [
    ["The Drake TORCHES {target}!", "Dragon breath on {target}! {name}'s pet is ruthless!", "{target} gets a face full of drake!"],
    ["That escort is worth every second of the fight.", "Owning the Drake means owning the river."],
  ],
  BARON_SPAWN: [["BARON GOOSE IS AWAKE!", "Oh no. The Goose has arrived."], ["Nobody wants to be in front for this.", "The leaders should be very nervous."]],
  BARON_HONK: [["HONK! The Goose BLASTS the front of the pack!", "THE HONK! Everyone at the front is stunned!"], ["That shockwave is the great equaliser.", "This is why you don't lead into Baron."]],
  BARON_STEAL: [["BARON STEAL! {name} TAKES IT FROM BEHIND!", "IT'S A STEAL! {name} WITH THE HAND OF BARON!"], ["Incredible. From behind, no less.", "That is the comeback mechanic working perfectly."]],
  BARON_TAKEN: [["{name} takes Baron! Hand of Baron!", "Baron to {name}!"], ["Safe take from the leader.", "The rich get richer."]],
  SHORTCUT_ENTER: [["{name} is going into the JUNGLE?!", "Wait, {name} is taking the jungle path!"], ["High risk. High reward. Low intelligence?", "I would not have done that."]],
  SHORTCUT_GOOD: [["IT PAYS OFF! {name} comes out AHEAD!", "THE JUNGLE PATH WORKS for {name}!"], ["Okay. I take it back.", "Calculated. Apparently."]],
  SHORTCUT_BAD: [["{name} is STUCK in the reeds!", "Oh no, {name} is tangled in the jungle!"], ["As I predicted.", "That's a reed diff."]],
  COMEBACK: [["{name} has come back from LAST PLACE!", "THE COMEBACK IS REAL! {name}!"], ["Never count out a duck with nothing to lose.", "From the bottom to the top. Remarkable."]],
  FINAL_STRETCH: [["FINAL STRETCH! {name} leads to the Nexus!", "Here comes the Nexus! {name} in front!"], ["This is where races are thrown.", "Hold your nerve, {name}."]],
  CLOSE_FINISH: [["PHOTO FINISH! I CAN'T CALL IT!", "BY A BEAK! WHAT A FINISH!"], ["{margin} seconds. Unbelievable.", "That's the closest race we've seen tonight."]],
  FINISH: [["{name} WINS IT! {name} TAKES THE NEXUS!", "VICTORY FOR {name}!", "{name} DESTROYS THE NEXUS! WHAT A RACE!"], ["Well deserved, {name}.", "A clinic in paddling from {name}."]],
  FILLER: [
    ["What a race this is!", "The pond is absolutely buzzing!", "Look at those paddles go!", "I can barely keep up with these ducks!"],
    ["The water's choppy on the left side.", "Lane position matters more than people think.", "This is a very honest pond tonight.", "Note the wing discipline from the back of the pack."],
  ],
  FILLER_STAT: [[], ["{name} has {stat} this race.", "Fun fact: {name} has {stat}.", "Stat check. {name}: {stat}."]],
  OUTRO: [["What a race! Teams are locked in!", "That's the match! Thank you, Summoner's River!"], []],
  OUTRO2: [[], ["We'll see these ducks again. Probably in a rematch.", "Analysis complete. Chaos won."]],
};

export const ELEMENT_NAMES: Record<string, string> = {
  infernal: "INFERNAL",
  ocean: "OCEAN",
  cloud: "CLOUD",
  mountain: "MOUNTAIN",
};

export const POWERUP_NAMES: Record<string, string> = { bread: "BREAD", anchor: "anchor (yikes)", shield: "shield", portal: "portal" };
