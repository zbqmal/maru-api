import { toMonthlyActivityResponseDto } from '../dto/monthly-activity-response.dto';

describe('toMonthlyActivityResponseDto', () => {
  it('returns user-recorded and all-member dates separately', () => {
    expect(
      toMonthlyActivityResponseDto('2024-06', [
        {
          date: '2024-06-01',
          currentUserRecorded: true,
          allMembersRecorded: true,
        },
        {
          date: '2024-06-02',
          currentUserRecorded: true,
          allMembersRecorded: false,
        },
      ]),
    ).toEqual({
      month: '2024-06',
      recordedDates: ['2024-06-01', '2024-06-02'],
      allMembersRecordedDates: ['2024-06-01'],
    });
  });
});
