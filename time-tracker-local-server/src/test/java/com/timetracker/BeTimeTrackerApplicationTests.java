package com.timetracker;

import com.timetracker.dto.LunchConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.ResponseEntity;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

@SpringBootTest
class BeTimeTrackerApplicationTests {

	@Autowired
	private EventController eventController;

	@Test
	void contextLoads() {
		ResponseEntity<LunchConfig> res = eventController.getConfig().block();
		assertNotNull(res);
		LunchConfig config = res.getBody();
		assertNotNull(config);
		assertEquals("12:30", config.defaultLunchStart());
		assertEquals("13:30", config.defaultLunchEnd());
	}

}
