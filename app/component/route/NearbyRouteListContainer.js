import React, { PropTypes } from 'react';
import Relay from 'react-relay';
import NextDeparturesList from '../departure/next-departures-list';
import config from '../../config';
import mapProps from 'recompose/mapProps';
const STOP_COUNT = 20;

class NearbyRouteListContainer extends React.Component {
  static propTypes = {
    stops: PropTypes.object.isRequired, // TODO: improve validation
    currentTime: PropTypes.string.isRequired,
    modes: PropTypes.array.isRequired,
  }

  static contextTypes = {
    getStore: React.PropTypes.func.isRequired,
  };

  getNextDepartures() {
    const seenDepartures = {};

    const stops = this.props.stops.stopsByRadius.edges.map(edge => edge.node);

    const nextDepartures = [];

    for (const stopAtDistance of stops) {
      const keepStoptimes = [];

      if (stopAtDistance.stop.stoptimes == null) {
        continue;
      }

      for (const pattern of stopAtDistance.stop.stoptimes) {
        if (pattern.stoptimes.length === 0) {
          continue;
        }

        const seenKey = `${pattern.pattern.route.gtfsId}:${pattern.pattern.headsign}`;
        const isSeen = seenDepartures[seenKey];
        const isModeIncluded = this.props.modes.includes(pattern.pattern.route.type);
        const isPickup = pattern.stoptimes[0].pickupType !== 'NONE';

        if (!isSeen && isModeIncluded && isPickup) {
          keepStoptimes.push(pattern);
          seenDepartures[seenKey] = true;
        }
      }

      for (const stoptime of keepStoptimes) {
        nextDepartures.push({
          distance: stopAtDistance.distance,
          stoptime,
        });
      }
    }

    return nextDepartures;
  }

  render() {
    return (
      <NextDeparturesList
        departures={this.getNextDepartures()}
        currentTime={parseInt(this.props.currentTime, 10)}
      />);
  }
}

export default Relay.createContainer(NearbyRouteListContainer, {
  fragments: {
    stops: () => Relay.QL`
      fragment on QueryType {
        stopsByRadius(
          lat: $lat,
          lon: $lon,
          radius: $radius,
          agency: $agency,
          first: $numberOfStops
        ) {
          edges {
            node {
              distance
              stop {
                gtfsId
                stoptimes: stoptimesForPatterns(
                  numberOfDepartures:2,
                  startTime: $currentTime,
                  timeRange: 7200
                ) {
                  pattern {
                    alerts {
                      effectiveStartDate
                      effectiveEndDate
                      trip {
                        gtfsId
                      }
                    }
                    code
                    headsign
                    route {
                      gtfsId
                      shortName
                      longName
                      type
                      color
                    }
                  }
                  stoptimes {
                    pickupType
                    realtimeState
                    realtimeDeparture
                    scheduledDeparture
                    realtime
                    serviceDay
                    trip {
                      gtfsId
                    }
                  }
                }
              }
            }
          }
        }
      }
    `,
  },

  initialVariables: {
    lat: null,
    lon: null,
    radius: config.nearbyRoutes.radius,
    numberOfStops: STOP_COUNT,
    agency: config.preferredAgency,
    currentTime: '0',
  },
});
