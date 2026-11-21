package com.timetracker.repository;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Properties;
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.timetracker.FileSystemException;

@Service
public class FileSytemService {

    private static final Logger log = LoggerFactory.getLogger(FileSytemService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.config-file:config.properties}")
    private String configFilePath = "config.properties";

    @Value("${app.events-dir:events}")
    private String eventsDirPath = "events";

    @Value("${app.overrides-dir:overrides}")
    private String overridesDirPath = "overrides";

    public FileSytemService() {
    }

    public FileSytemService(String configFilePath) {
        this.configFilePath = configFilePath;
    }

    public Path resolvePath(String file) {
        return Paths.get(file).toAbsolutePath().normalize();
    }

    public Path resolveConfigFile() {
        return resolvePath(configFilePath);
    }

    // ---------------------------------------------------------
    // Configuration File Access
    // ---------------------------------------------------------

    /**
     * Writes the given properties to the config file only if it does not exist yet.
     *
     * @return true if the file was created, false if it already existed
     */
    public synchronized boolean storePropertiesIfAbsent(Properties props) throws IOException {
        if (loadProperties().isPresent()) {
            return false;
        }
        storeProperties(props);
        return true;
    }

    public synchronized Optional<Properties> loadProperties() {
        Path configPath = resolveConfigFile();
        if (Files.isRegularFile(configPath)) {
            log.info("Loading config from: {}", configPath.toAbsolutePath());
            Properties props = new Properties();
            try (InputStream in = Files.newInputStream(configPath)) {
                props.load(in);
                return Optional.of(props);
            } catch (IOException e) {
                log.warn("Failed to read config.properties from {}: {}", configPath, e.getMessage());
            }
        }
        return Optional.empty();
    }

    /** Sets a single property in the config file, preserving the other existing properties. */
    public synchronized void setConfigProperty(String key, String value) throws IOException {
        Properties props = loadProperties().orElseGet(Properties::new);
        props.setProperty(key, value);
        storeProperties(props);
        log.info("Saved {}={} to {}", key, value, resolveConfigFile());
    }

    /** Writes the given properties to the config file, creating parent directories if needed. */
    private synchronized void storeProperties(Properties props) throws IOException {
        Path configPath = resolveConfigFile();
        if (configPath.getParent() != null && !Files.exists(configPath.getParent())) {
            Files.createDirectories(configPath.getParent());
        }
        try (OutputStream out = Files.newOutputStream(configPath)) {
            props.store(out, "Time Tracker Configuration");
        } catch (IOException e) {
            throw new FileSystemException("Failed to write config.properties to " + configPath, e);
        }
    }

    // ---------------------------------------------------------
    // Events Directory & File Access
    // ---------------------------------------------------------

    public <R> Optional<R> loadJson(Path path, TypeReference<R> valueTypeRef){

        if (!Files.isRegularFile(path)) {
            return Optional.empty();
        }

        try {
            return Optional.ofNullable(objectMapper.readValue(path.toFile(), valueTypeRef));
        } catch (IOException e) {
            throw new FileSystemException("Failed to read JSON from " + path, e);
        }
    }

    public synchronized void storeJson(Path path, Object value) {
        try {
            if (path.getParent() != null && !Files.exists(path.getParent())) {
                Files.createDirectories(path.getParent());
            }
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(path.toFile(), value);
        } catch (IOException e) {
            throw new FileSystemException("Failed to create parent directories for " + path, e);
        }
    }

    public Path resolveEventsDir() {
        return resolvePath(eventsDirPath);
    }

    public synchronized List<String> readFolderFiles(Path folder, String filter) {

        if (!Files.isDirectory(folder)) {
            return Collections.emptyList();
        }

        try (DirectoryStream<Path> stream = Files.newDirectoryStream(folder, filter)) {
            List<String> result = new ArrayList<>();
            stream.forEach(entry -> result.add(entry.getFileName().toString()));
            return result;
        } catch (IOException e) {
            throw new FileSystemException("Failed to read directory " + folder, e);
        }
    }

    public boolean deleteFile(Path path) {
        try {
            return Files.deleteIfExists(path);
        } catch (IOException e) {
            throw new FileSystemException("Failed to delete file " + path, e);
        }
    }

    public synchronized void clearAllEventFiles() {
        Path eventsDir = resolveEventsDir();
        readFolderFiles(eventsDir, "events-*.json")
                .forEach(fileName -> deleteFile(eventsDir.resolve(fileName)));
    }

    // ---------------------------------------------------------
    // User Overrides Directory & File Access
    // ---------------------------------------------------------

    public Path resolveUserOverridesDir() {
        return resolvePath(overridesDirPath);
    }
}
