-- Public Transport (Jeepney) profile for OSRM
-- Jeepneys follow specific routes and have different characteristics than regular cars
-- - Prefer main roads and established routes
-- - Slower speeds due to frequent stops
-- - Higher ground clearance than cars
-- - Cannot use residential areas as freely

api_version = 4

Set = require('lib/set')
Sequence = require('lib/sequence')
Handlers = require("lib/way_handlers")
find_access_tag = require("lib/access").find_access_tag
limit = require("lib/maxspeed").limit
Measure = require("lib/measure")

function setup()
  return {
    properties = {
      max_speed_for_map_matching      = 140/3.6, -- 140kmph -> m/s (slower than private cars)
      weight_name                     = 'routability',
      process_call_tagless_node       = false,
      u_turn_penalty                  = 30,  -- Higher penalty for u-turns (harder with longer vehicle)
      continue_straight_at_waypoint   = true,
      use_turn_restrictions           = true,
      left_hand_driving               = false,
      traffic_light_penalty           = 5,  -- Higher penalty due to frequent stops
    },

    default_mode            = mode.driving,
    default_speed           = 40,  -- Slower default speed
    oneway_handling         = true,
    side_road_multiplier    = 0.6,  -- Avoid side roads
    turn_penalty            = 10,
    speed_reduction         = 0.7,

    -- Public transport specific penalties
    residential_penalty     = 1.5,  -- 50% slower on residential roads
    service_road_penalty    = 2.0,  -- 100% slower on service roads
    main_road_bonus         = 0.9,  -- 10% faster on main roads (established routes)

    -- Speed limits based on road types (km/h)
    -- Generally slower than cars due to passenger boarding/alighting
    speeds = Sequence {
      highway = {
        motorway        = 80,  -- Reduced from car (110)
        motorway_link   = 40,
        trunk           = 70,  -- Reduced from car (110)
        trunk_link      = 40,
        primary         = 50,  -- Reduced from car (70) - main jeepney routes
        primary_link    = 35,
        secondary       = 40,  -- Reduced from car (70) - common jeepney routes
        secondary_link  = 30,
        tertiary        = 30,  -- Reduced from car (50)
        tertiary_link   = 20,
        unclassified    = 25,  -- Reduced from car (50)
        residential     = 15,  -- Much slower on residential (was 50 for cars)
        living_street   = 10,
        service         = 10,  -- Very slow on service roads
      }
    },

    -- Route selection based on accessibility
    route_speeds = Sequence {
      ferry = 5,
      shuttle_train = 10
    },

    bridge_speeds = Sequence {
      movable = 5
    },

    -- Access tags
    access_tag_whitelist = Set {
      'yes',
      'motorcar',
      'motor_vehicle',
      'vehicle',
      'permissive',
      'designated',
      'psv',  -- Public service vehicle
      'bus',
      'taxi'
    },

    access_tag_blacklist = Set {
      'no',
      'private',
      'agricultural',
      'forestry',
      'emergency',
      'customers',
      'delivery'
    },

    restricted_access_tag_list = Set {
      'private',
      'delivery',
      'destination',
      'customers',
    },

    access_tags_hierarchy = Sequence {
      'psv',  -- Public service vehicle (priority)
      'bus',
      'motorcar',
      'motor_vehicle',
      'vehicle',
      'access'
    },

    service_tag_restricted = Set {
      ['parking_aisle'] = true,
      ['driveway'] = true
    },

    restrictions = Sequence {
      'psv',
      'bus',
      'motorcar',
      'motor_vehicle',
      'vehicle'
    },

    classes = Sequence {
        'toll', 'motorway', 'ferry', 'restricted', 'tunnel'
    },

    -- Exclude certain road types
    excludable = Sequence {
        Set {'toll'},
        Set {'motorway'},
        Set {'ferry'}
    },

    avoid = Set {
      'area',
      'toll_gantry',
      'turning_loop'
    },

    relation_types = Sequence {
      "route"
    },

    suffix_list = Set {
      'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'North', 'South', 'East', 'West', 'Nor', 'Sou', 'Est', 'Ouest'
    },

    -- Duration penalties
    u_turn_penalty                  = 30,
    traffic_light_penalty           = 5,
    use_turn_restrictions           = true,
  }
end

function process_node(profile, node, result)
  -- Process barriers and restrictions
  local barrier = node:get_value_by_key("barrier")
  local access = find_access_tag(node, profile.access_tags_hierarchy)

  if barrier and barrier ~= "" then
    if profile.avoid[barrier] then
      result.barrier = true
    end
  end

  -- Traffic lights (significant for public transport due to stops)
  local highway = node:get_value_by_key("highway")
  if highway == "traffic_signals" then
    result.traffic_lights = true
  end

  -- Bus stops (optional: could add bonus for routes near bus stops)
  local amenity = node:get_value_by_key("amenity")
  if amenity == "bus_stop" then
    result.traffic_lights = false  -- No penalty at bus stops
  end
end

function process_way(profile, way, result)
  local data = {
    highway = way:get_value_by_key('highway'),
    bridge = way:get_value_by_key('bridge'),
    route = way:get_value_by_key('route'),
    duration = way:get_value_by_key('duration'),
    maxspeed = way:get_value_by_key('maxspeed'),
    name = way:get_value_by_key('name'),
    oneway = way:get_value_by_key('oneway'),
    service = way:get_value_by_key('service'),
    area = way:get_value_by_key('area'),
    psv = way:get_value_by_key('psv'),
    bus = way:get_value_by_key('bus'),
    public_transport = way:get_value_by_key('public_transport'),
  }

  -- Initial rejection based on area
  if data.area == "yes" then
    return
  end

  -- Priority for PSV (public service vehicle) lanes
  local is_psv_route = false
  if data.psv == 'yes' or data.psv == 'designated' or 
     data.bus == 'yes' or data.bus == 'designated' or
     data.public_transport == 'yes' then
    is_psv_route = true
  end

  -- Check access
  local access = find_access_tag(way, profile.access_tags_hierarchy)
  if access and profile.access_tag_blacklist[access] then
    -- Exception for PSV-designated roads
    if not is_psv_route then
      return
    end
  end

  -- Get base speed from highway type
  local highway = data.highway
  if not highway or highway == '' then
    return
  end

  local speed = profile.speeds.highway[highway]
  if not speed then
    return  -- Unknown highway type
  end

  -- Apply bonuses/penalties based on road type
  if highway == 'primary' or highway == 'secondary' or highway == 'trunk' then
    -- Main roads - bonus speed (established routes)
    speed = speed / profile.main_road_bonus
  elseif highway == 'residential' then
    -- Residential roads - penalty
    speed = speed / profile.residential_penalty
  elseif highway == 'service' or data.service then
    -- Service roads - heavy penalty
    speed = speed / profile.service_road_penalty
  end

  -- Bonus for PSV lanes
  if is_psv_route then
    speed = speed * 1.1  -- 10% bonus on PSV routes
  end

  -- Oneway handling
  local oneway = data.oneway
  if oneway == 'yes' or oneway == '1' or oneway == 'true' then
    result.forward_mode = mode.driving
    result.backward_mode = mode.inaccessible
  elseif oneway == '-1' then
    result.forward_mode = mode.inaccessible
    result.backward_mode = mode.driving
  else
    result.forward_mode = mode.driving
    result.backward_mode = mode.driving
  end

  -- Apply maxspeed if available
  if data.maxspeed then
    local max = tonumber(data.maxspeed)
    if max then
      speed = math.min(speed, max)
    end
  end

  -- Set speeds
  result.forward_speed = speed
  result.backward_speed = speed
  result.forward_rate = speed
  result.backward_rate = speed

  -- Classes (for exclusions)
  if highway == 'motorway' or highway == 'motorway_link' then
    result.forward_classes['motorway'] = true
    result.backward_classes['motorway'] = true
  end

  if data.bridge and data.bridge == 'yes' then
    result.forward_classes['bridge'] = true
    result.backward_classes['bridge'] = true
  end

  -- Name
  if data.name then
    result.name = data.name
  end
end

return {
  setup = setup,
  process_way = process_way,
  process_node = process_node,
  process_turn = function(profile, turn) 
    turn.duration = 0.
    if turn.direction_modifier == "uturn" then
       turn.duration = turn.duration + profile.properties.u_turn_penalty
    end
    if turn.has_traffic_light then
       turn.duration = turn.duration + profile.properties.traffic_light_penalty
    end
    -- Additional penalty for turns (harder with longer vehicle)
    if turn.angle and math.abs(turn.angle) > 60 then
      turn.duration = turn.duration + 2
    end
  end
}
